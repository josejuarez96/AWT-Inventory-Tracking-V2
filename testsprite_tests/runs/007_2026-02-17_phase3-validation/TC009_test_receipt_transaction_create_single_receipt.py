import requests
from datetime import datetime

BASE_URL = "http://localhost:3000"
ADMIN_USERNAME = "jose"
ADMIN_PASSWORD = "Password1"
TIMEOUT = 30


def get_auth_token(username, password):
    url = f"{BASE_URL}/api/auth/login"
    payload = {
        "username": username,
        "password": password
    }
    response = requests.post(url, json=payload, timeout=TIMEOUT)
    response.raise_for_status()
    data = response.json()
    token = data.get("token")
    assert token, "Token not found in login response"
    return token


def get_first_active_item(token):
    url = f"{BASE_URL}/api/items"
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(url, headers=headers, timeout=TIMEOUT)
    response.raise_for_status()
    data = response.json()
    items = data.get("items", [])
    assert isinstance(items, list), "Items should be a list"
    assert len(items) > 0, "No active items found to create receipt"
    return items[0]  # return first active item


def get_first_active_vendor(token):
    url = f"{BASE_URL}/api/vendors"
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(url, headers=headers, timeout=TIMEOUT)
    response.raise_for_status()
    data = response.json()
    vendors = data.get("vendors", [])
    assert isinstance(vendors, list), "Vendors should be a list"
    assert len(vendors) > 0, "No active vendors found to create receipt"
    return vendors[0]  # return first active vendor


def test_receipt_transaction_create_single_receipt():
    token = get_auth_token(ADMIN_USERNAME, ADMIN_PASSWORD)
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    # Get active item and vendor for receipt
    item = get_first_active_item(token)
    vendor = get_first_active_vendor(token)

    payload = {
        "itemId": item["id"],
        "vendorId": vendor["id"],
        "location": "ADEL",  # Valid location per schema
        "quantity": 10,
        "unitCost": 15.5,
        "transactionDate": datetime.utcnow().isoformat() + "Z"
    }

    url = f"{BASE_URL}/api/transactions/receipts"
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=TIMEOUT)
        assert response.status_code == 201, f"Expected status 201, got {response.status_code}"
        resp_json = response.json()

        assert "transaction" in resp_json, "'transaction' key missing in response"
        transaction = resp_json["transaction"]
        assert isinstance(transaction, dict), "'transaction' should be a dict"
        assert transaction.get("itemId") == payload["itemId"], "Returned transaction itemId mismatch"
        assert transaction.get("vendorId") == payload["vendorId"], "Returned transaction vendorId mismatch"
        assert transaction.get("location") == payload["location"], "Returned transaction location mismatch"
        assert abs(transaction.get("quantity", 0) - payload["quantity"]) < 1e-6, "Returned transaction quantity mismatch"
        assert abs(transaction.get("unitCost", 0) - payload["unitCost"]) < 1e-6, "Returned transaction unitCost mismatch"

        # lastPaidPrice can be number or null
        assert "lastPaidPrice" in resp_json, "'lastPaidPrice' missing in response"
        last_paid_price = resp_json["lastPaidPrice"]
        assert (last_paid_price is None) or (isinstance(last_paid_price, (int, float))), "lastPaidPrice should be number or null"

    except requests.RequestException as e:
        assert False, f"HTTP request failed: {e}"


test_receipt_transaction_create_single_receipt()
