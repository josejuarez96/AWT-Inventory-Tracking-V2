import requests
from datetime import datetime, timedelta
import time

BASE_URL = "http://localhost:3002"
TIMEOUT = 30

def test_standard_user_blocked_from_posting_receipt_older_than_7_days():
    # Step 1: Login as standard user (alix)
    login_url = f"{BASE_URL}/api/auth/login"
    login_payload = {"username": "alix", "password": "Password1"}
    try:
        login_resp = requests.post(login_url, json=login_payload, timeout=TIMEOUT)
        time.sleep(2)
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        token = login_resp.json().get("token")
        assert token, "No token in login response"
    except Exception as e:
        raise AssertionError(f"Login request failed: {e}")

    headers = {"Authorization": f"Bearer {token}"}

    # Step 2: Get a valid itemId from GET /api/items
    items_url = f"{BASE_URL}/api/items"
    try:
        items_resp = requests.get(items_url, headers=headers, timeout=TIMEOUT)
        time.sleep(2)
        assert items_resp.status_code == 200, f"Failed to get items: {items_resp.text}"
        items_data = items_resp.json()
        items_list = items_data.get("items")
        assert items_list and isinstance(items_list, list), "Items list missing or invalid"
        itemId = items_list[0].get("id")
        assert isinstance(itemId, int), "Invalid itemId from items list"
    except Exception as e:
        raise AssertionError(f"Get items request failed: {e}")

    # Step 3: Need a vendorId for the receipt
    # As vendorId is mandatory but test data about available vendors is not provided,
    # We'll get the first vendor from GET /api/vendors
    vendors_url = f"{BASE_URL}/api/vendors"
    try:
        vendors_resp = requests.get(vendors_url, headers=headers, timeout=TIMEOUT)
        time.sleep(2)
        assert vendors_resp.status_code == 200, f"Failed to get vendors: {vendors_resp.text}"
        vendors_data = vendors_resp.json()
        vendors_list = vendors_data.get("vendors")
        assert vendors_list and isinstance(vendors_list, list), "Vendors list missing or invalid"
        vendorId = vendors_list[0].get("id")
        assert isinstance(vendorId, int), "Invalid vendorId from vendors list"
    except Exception as e:
        raise AssertionError(f"Get vendors request failed: {e}")

    # Step 4: Prepare POST /api/transactions/receipts payload with transactionDate 10 days ago
    receipt_url = f"{BASE_URL}/api/transactions/receipts"
    transaction_date = (datetime.utcnow() - timedelta(days=10)).strftime("%Y-%m-%d")
    receipt_payload = {
        "itemId": itemId,
        "vendorId": vendorId,
        "location": "ADEL",
        "quantity": 1,
        "unitCost": 10.0,
        "transactionDate": transaction_date
    }

    # Step 5: POST the receipt and expect 400 with error containing "must be posted by an admin"
    try:
        receipt_resp = requests.post(receipt_url, headers={**headers, "Content-Type": "application/json"}, json=receipt_payload, timeout=TIMEOUT)
        time.sleep(2)
        assert receipt_resp.status_code == 400, f"Expected 400 response but got {receipt_resp.status_code}: {receipt_resp.text}"
        error_resp = receipt_resp.text.lower()
        assert "must be posted by an admin" in error_resp or 'must be posted by an admin' in receipt_resp.text, "Expected error message not found in response"
    except Exception as e:
        raise AssertionError(f"POST receipt request failed: {e}")

test_standard_user_blocked_from_posting_receipt_older_than_7_days()