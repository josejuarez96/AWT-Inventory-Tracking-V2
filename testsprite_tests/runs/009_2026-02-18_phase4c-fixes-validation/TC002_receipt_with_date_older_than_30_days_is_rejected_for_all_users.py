import requests
import datetime
import time

BASE_URL = "http://localhost:3002"
TIMEOUT = 30

def login(username: str, password: str) -> str:
    url = f"{BASE_URL}/api/auth/login"
    payload = {"username": username, "password": password}
    resp = requests.post(url, json=payload, timeout=TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    token = data.get("token")
    assert token, "Login did not return a token"
    return token

def get_first_item_id(token: str) -> int:
    url = f"{BASE_URL}/api/items"
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.get(url, headers=headers, timeout=TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    items = data.get("items")
    assert items and isinstance(items, list) and len(items) > 0, "No items found"
    first_item = items[0]
    item_id = first_item.get("id")
    assert item_id is not None, "First item has no id"
    return item_id

def get_first_vendor_id(token: str) -> int:
    url = f"{BASE_URL}/api/vendors"
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.get(url, headers=headers, timeout=TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    vendors = data.get("vendors")
    assert vendors and isinstance(vendors, list) and len(vendors) > 0, "No vendors found"
    first_vendor = vendors[0]
    vendor_id = first_vendor.get("id")
    assert vendor_id is not None, "First vendor has no id"
    return vendor_id

def test_receipt_date_older_than_30_days_rejected():
    # Calculate transactionDate 35 days ago
    transaction_date = (datetime.datetime.utcnow() - datetime.timedelta(days=35)).date().isoformat()

    # Admin Login
    admin_token = login("jose", "Password1")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # Get valid itemId and vendorId with admin token
    item_id = get_first_item_id(admin_token)
    vendor_id = get_first_vendor_id(admin_token)

    # Attempt to post receipt with 35 days old date as admin
    url = f"{BASE_URL}/api/transactions/receipts"
    payload = {
        "itemId": item_id,
        "location": "ADEL",
        "quantity": 1,
        "unitCost": 10.0,
        "vendorId": vendor_id,
        "transactionDate": transaction_date
    }
    resp = requests.post(url, headers=admin_headers, json=payload, timeout=TIMEOUT)
    assert resp.status_code == 400, f"Admin expected 400 but got {resp.status_code}"
    json_resp = resp.json()
    error_msg = str(json_resp).lower()
    assert "cannot be more than 30 days in the past" in error_msg, f"Admin error message missing expected text: {json_resp}"

    time.sleep(2)  # Wait 2 seconds due to rate limiter

    # Standard User Login
    user_token = login("alix", "Password1")
    user_headers = {"Authorization": f"Bearer {user_token}"}

    # Get valid itemId and vendorId with user token
    item_id_user = get_first_item_id(user_token)
    vendor_id_user = get_first_vendor_id(user_token)

    # Attempt to post receipt with 35 days old date as standard user
    payload_user = {
        "itemId": item_id_user,
        "location": "ADEL",
        "quantity": 1,
        "unitCost": 10.0,
        "vendorId": vendor_id_user,
        "transactionDate": transaction_date
    }
    resp_user = requests.post(url, headers=user_headers, json=payload_user, timeout=TIMEOUT)
    assert resp_user.status_code == 400, f"User expected 400 but got {resp_user.status_code}"
    json_resp_user = resp_user.json()
    error_msg_user = str(json_resp_user).lower()
    assert "cannot be more than 30 days in the past" in error_msg_user, f"User error message missing expected text: {json_resp_user}"

test_receipt_date_older_than_30_days_rejected()