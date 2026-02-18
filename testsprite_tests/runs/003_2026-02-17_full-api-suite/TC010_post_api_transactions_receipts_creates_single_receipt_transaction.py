import requests
from datetime import datetime

BASE_URL = "http://localhost:3000"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
ITEMS_URL = f"{BASE_URL}/api/items"
VENDORS_URL = f"{BASE_URL}/api/vendors"
RECEIPTS_URL = f"{BASE_URL}/api/transactions/receipts"

def test_post_api_transactions_receipts_creates_single_receipt_transaction():
    # Helper to login and get token
    def login(username, password):
        response = requests.post(
            LOGIN_URL,
            json={"username": username, "password": password},
            timeout=30,
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        token = data.get("token")
        assert token, "No token in login response"
        return token

    # Login with admin credentials
    token = login("jose", "password123")
    headers = {"Authorization": f"Bearer {token}"}

    # Get valid itemId
    resp_items = requests.get(ITEMS_URL, headers=headers, timeout=30)
    assert resp_items.status_code == 200, f"Failed to get items: {resp_items.text}"
    items_data = resp_items.json()
    items = items_data.get("items")
    assert items and isinstance(items, list), "Items response is missing or invalid"
    valid_item_id = items[0].get("id")
    assert isinstance(valid_item_id, int), "Invalid item id found"

    # Get valid vendorId
    resp_vendors = requests.get(VENDORS_URL, headers=headers, timeout=30)
    assert resp_vendors.status_code == 200, f"Failed to get vendors: {resp_vendors.text}"
    vendors_data = resp_vendors.json()
    vendors = vendors_data.get("vendors")
    assert vendors and isinstance(vendors, list), "Vendors response is missing or invalid"
    valid_vendor_id = vendors[0].get("id")
    assert isinstance(valid_vendor_id, int), "Invalid vendor id found"

    # Define common payload parameters
    location = "ADEL"
    quantity = 5
    unit_cost = 10.50
    transaction_date = "2026-02-17"

    # 1) Test creation with valid itemId and vendorId - Expect 201
    payload_valid = {
        "itemId": valid_item_id,
        "vendorId": valid_vendor_id,
        "location": location,
        "quantity": quantity,
        "unitCost": unit_cost,
        "transactionDate": transaction_date,
    }
    resp_post_valid = requests.post(RECEIPTS_URL, headers=headers, json=payload_valid, timeout=30)
    assert resp_post_valid.status_code == 201, f"Valid POST failed: {resp_post_valid.text}"
    data_valid = resp_post_valid.json()
    # Validate presence of transaction and lastPaidPrice keys
    assert "transaction" in data_valid and isinstance(data_valid["transaction"], dict), "Missing or invalid 'transaction' in response"
    assert "lastPaidPrice" in data_valid and (isinstance(data_valid["lastPaidPrice"], (float, int)) or data_valid["lastPaidPrice"] is None), "Missing or invalid 'lastPaidPrice'"

    # Validate some fields in transaction
    transaction = data_valid["transaction"]
    assert transaction.get("itemId") == valid_item_id, "Transaction itemId mismatch"
    assert transaction.get("vendorId") == valid_vendor_id, "Transaction vendorId mismatch"
    assert transaction.get("location") == location, "Transaction location mismatch"
    assert abs(float(transaction.get("quantity") or 0) - quantity) < 0.0001, "Transaction quantity mismatch"
    assert abs(float(transaction.get("unitCost") or 0) - unit_cost) < 0.0001, "Transaction unitCost mismatch"

    # Compare only date parts for transactionDate
    resp_date_str = transaction.get("transactionDate")
    assert resp_date_str, "Transaction missing transactionDate"
    req_date = datetime.strptime(transaction_date, "%Y-%m-%d").date()
    try:
        resp_date = datetime.strptime(resp_date_str[:10], "%Y-%m-%d").date()
    except Exception as e:
        assert False, f"Invalid transactionDate format in response: {resp_date_str}"
    assert resp_date == req_date, "Transaction date mismatch"

    # 2) Test creation with invalid itemId - Expect 404
    invalid_item_id = 999999999  # Assuming this ID does not exist
    payload_invalid_item = {
        "itemId": invalid_item_id,
        "vendorId": valid_vendor_id,
        "location": location,
        "quantity": quantity,
        "unitCost": unit_cost,
        "transactionDate": transaction_date,
    }
    resp_post_invalid = requests.post(RECEIPTS_URL, headers=headers, json=payload_invalid_item, timeout=30)
    assert resp_post_invalid.status_code == 404, f"Invalid itemId POST expected 404 but got {resp_post_invalid.status_code}"

test_post_api_transactions_receipts_creates_single_receipt_transaction()
