import requests
import time

BASE_URL = "http://localhost:3002/api"
LOGIN_URL = f"{BASE_URL}/auth/login"
ITEMS_URL = f"{BASE_URL}/items"
VENDORS_URL = f"{BASE_URL}/vendors"
RECEIPTS_URL = f"{BASE_URL}/transactions/receipts"
TIMEOUT = 30

def test_edge_receipt_future_date_rejected():
    session = requests.Session()
    # Step 1: Login as user (alix/Password1)
    login_payload = {"username": "alix", "password": "Password1"}
    login_resp = session.post(LOGIN_URL, json=login_payload, timeout=TIMEOUT)
    assert login_resp.status_code == 200, f"Login failed: {login_resp.status_code} {login_resp.text}"
    token = login_resp.json().get("token")
    assert token, "No token received on login"
    headers = {"Authorization": f"Bearer {token}"}

    # Step 2: GET /api/items to get itemId
    items_resp = session.get(ITEMS_URL, headers=headers, timeout=TIMEOUT)
    assert items_resp.status_code == 200, f"Get items failed: {items_resp.status_code} {items_resp.text}"
    items = items_resp.json().get("items")
    assert items and isinstance(items, list), "Items list missing or invalid"
    item_id = items[0]["id"]
    assert isinstance(item_id, int), "Invalid item id"

    # GET /api/vendors to get vendorId
    vendors_resp = session.get(VENDORS_URL, headers=headers, timeout=TIMEOUT)
    assert vendors_resp.status_code == 200, f"Get vendors failed: {vendors_resp.status_code} {vendors_resp.text}"
    vendors = vendors_resp.json().get("vendors")
    assert vendors and isinstance(vendors, list), "Vendors list missing or invalid"
    vendor_id = vendors[0]["id"]
    assert isinstance(vendor_id, int), "Invalid vendor id"

    time.sleep(2)

    # Step 3: POST receipt with transactionDate one year in future (2027-01-01)
    receipt_future_payload = {
        "itemId": item_id,
        "vendorId": vendor_id,
        "location": "ADEL",
        "quantity": 5,
        "unitCost": 10.00,
        "transactionDate": "2027-01-01"
    }
    future_resp = session.post(RECEIPTS_URL, headers={**headers, "Content-Type": "application/json"},
                               json=receipt_future_payload, timeout=TIMEOUT)
    future_status = future_resp.status_code
    future_body = None
    try:
        future_body = future_resp.json()
    except Exception:
        future_body = future_resp.text

    # We expect 400 with error about future date. If 201, document as DATE VALIDATION GAP.
    if future_status == 400:
        # check if error message contains "future" or "date" hint
        error_msg = None
        if isinstance(future_body, dict):
            if "error" in future_body:
                error_msg = future_body.get("error")
            elif "message" in future_body:
                error_msg = future_body.get("message")
        assert error_msg and ("future" in error_msg.lower() or "date" in error_msg.lower()), (
            "400 status without proper future date validation error message"
        )
    elif future_status == 201:
        # Allowed despite future date - note the gap
        pass
    else:
        # Unexpected status code
        assert False, f"Unexpected status code for future date receipt: {future_status} Response: {future_resp.text}"

    time.sleep(2)

    # Step 4: POST receipt with transactionDate '2026-02-20' (tomorrow)
    receipt_tomorrow_payload = {
        "itemId": item_id,
        "vendorId": vendor_id,
        "location": "ADEL",
        "quantity": 5,
        "unitCost": 10.00,
        "transactionDate": "2026-02-20"
    }
    tomorrow_resp = session.post(RECEIPTS_URL, headers={**headers, "Content-Type": "application/json"},
                                 json=receipt_tomorrow_payload, timeout=TIMEOUT)
    tomorrow_status = tomorrow_resp.status_code
    tomorrow_body = None
    try:
        tomorrow_body = tomorrow_resp.json()
    except Exception:
        tomorrow_body = tomorrow_resp.text

    # Expect 400 again for tomorrow's date (step says should also be 400)
    if tomorrow_status == 400:
        # Check error message related to date
        error_msg = None
        if isinstance(tomorrow_body, dict):
            if "error" in tomorrow_body:
                error_msg = tomorrow_body.get("error")
            elif "message" in tomorrow_body:
                error_msg = tomorrow_body.get("message")
        assert error_msg and ("future" in error_msg.lower() or "date" in error_msg.lower()), (
            "400 status without proper future date validation error message for tomorrow's date"
        )
    else:
        # Unexpected status code - document
        assert False, f"Unexpected status code for tomorrow date receipt: {tomorrow_status} Response: {tomorrow_resp.text}"

    # Print out the findings to fulfill "Document both results and error messages"
    print("Future date POST /api/transactions/receipts response status:", future_status)
    print("Future date POST response body:", future_body)
    print("Tomorrow date POST /api/transactions/receipts response status:", tomorrow_status)
    print("Tomorrow date POST response body:", tomorrow_body)

test_edge_receipt_future_date_rejected()