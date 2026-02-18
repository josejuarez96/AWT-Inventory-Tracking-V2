import requests
import datetime
import time

BASE_URL = "http://localhost:3002"
TIMEOUT = 30

def login(username: str, password: str) -> str:
    url = f"{BASE_URL}/api/auth/login"
    payload = {"username": username, "password": password}
    try:
        resp = requests.post(url, json=payload, timeout=TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
        token = data.get("token")
        assert token and isinstance(token, str), "Login did not return a valid token"
        return token
    except requests.RequestException as e:
        raise RuntimeError(f"Login failed for user '{username}': {e}")

def get_first_item_id(token: str) -> int:
    url = f"{BASE_URL}/api/items"
    headers = {"Authorization": f"Bearer {token}"}
    try:
        resp = requests.get(url, headers=headers, timeout=TIMEOUT)
        resp.raise_for_status()
        items = resp.json().get("items", [])
        assert items, "No items found"
        first_item = items[0]
        item_id = first_item.get("id") or first_item.get("itemId") or first_item.get("ID")
        assert isinstance(item_id, int), "Invalid item ID type"
        return item_id
    except requests.RequestException as e:
        raise RuntimeError(f"Failed to get items: {e}")

def get_first_vendor_id(token: str) -> int:
    url = f"{BASE_URL}/api/vendors"
    headers = {"Authorization": f"Bearer {token}"}
    try:
        resp = requests.get(url, headers=headers, timeout=TIMEOUT)
        resp.raise_for_status()
        vendors = resp.json().get("vendors", [])
        assert vendors, "No vendors found"
        first_vendor = vendors[0]
        vendor_id = first_vendor.get("id") or first_vendor.get("vendorId") or first_vendor.get("ID")
        assert isinstance(vendor_id, int), "Invalid vendor ID type"
        return vendor_id
    except requests.RequestException as e:
        raise RuntimeError(f"Failed to get vendors: {e}")

def test_receipt_future_date_rejected_for_all_users():
    tomorrow = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()
    error_msg_expected = "Transaction date cannot be in the future"

    # Login as admin user 'jose'
    admin_token = login("jose", "Password1")
    time.sleep(2)
    admin_item_id = get_first_item_id(admin_token)
    time.sleep(2)
    admin_vendor_id = get_first_vendor_id(admin_token)
    time.sleep(2)

    url_receipts = f"{BASE_URL}/api/transactions/receipts"
    headers_admin = {
        "Authorization": f"Bearer {admin_token}",
        "Content-Type": "application/json"
    }
    payload = {
        "itemId": admin_item_id,
        "vendorId": admin_vendor_id,
        "location": "ADEL",
        "quantity": 1,
        "unitCost": 10.00,
        "transactionDate": tomorrow
    }
    resp_admin = requests.post(url_receipts, headers=headers_admin, json=payload, timeout=TIMEOUT)
    assert resp_admin.status_code == 400, f"Expected 400 for admin, got {resp_admin.status_code}"
    try:
        err = resp_admin.json()
        # Accept error message might be in multiple places; check keys or text
        msg = None
        if isinstance(err, dict):
            msg = err.get("error") or err.get("message") or err.get("errors")
            if isinstance(msg, list) and msg:
                # pick first message string if list
                msg = msg[0] if isinstance(msg[0], str) else None
            if msg is None:
                # try all string values concatenated
                concatenated = " ".join(str(v) for v in err.values() if isinstance(v, str))
                if error_msg_expected.lower() in concatenated.lower():
                    msg = concatenated
        assert msg and error_msg_expected.lower() in msg.lower(), f"Expected error message '{error_msg_expected}', got '{msg}'"
    except Exception:
        # fallback: test raw text
        assert error_msg_expected.lower() in resp_admin.text.lower()

    # Sleep to respect rate limiter
    time.sleep(2)

    # Login as standard user 'alix'
    user_token = login("alix", "Password1")
    time.sleep(2)
    user_item_id = get_first_item_id(user_token)
    time.sleep(2)
    user_vendor_id = get_first_vendor_id(user_token)
    time.sleep(2)

    headers_user = {
        "Authorization": f"Bearer {user_token}",
        "Content-Type": "application/json"
    }
    payload_user = {
        "itemId": user_item_id,
        "vendorId": user_vendor_id,
        "location": "ADEL",
        "quantity": 1,
        "unitCost": 10.00,
        "transactionDate": tomorrow
    }
    resp_user = requests.post(url_receipts, headers=headers_user, json=payload_user, timeout=TIMEOUT)
    assert resp_user.status_code == 400, f"Expected 400 for user, got {resp_user.status_code}"
    try:
        err = resp_user.json()
        msg = None
        if isinstance(err, dict):
            msg = err.get("error") or err.get("message") or err.get("errors")
            if isinstance(msg, list) and msg:
                msg = msg[0] if isinstance(msg[0], str) else None
            if msg is None:
                concatenated = " ".join(str(v) for v in err.values() if isinstance(v, str))
                if error_msg_expected.lower() in concatenated.lower():
                    msg = concatenated
        assert msg and error_msg_expected.lower() in msg.lower(), f"Expected error message '{error_msg_expected}', got '{msg}'"
    except Exception:
        assert error_msg_expected.lower() in resp_user.text.lower()

test_receipt_future_date_rejected_for_all_users()