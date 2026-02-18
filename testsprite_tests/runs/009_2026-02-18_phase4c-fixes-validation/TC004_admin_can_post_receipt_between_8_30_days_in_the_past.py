import requests
import time
from datetime import datetime, timedelta

BASE_URL = "http://localhost:3002"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
ITEMS_URL = f"{BASE_URL}/api/items"
VENDORS_URL = f"{BASE_URL}/api/vendors"
RECEIPTS_URL = f"{BASE_URL}/api/transactions/receipts"

ADMIN_USERNAME = "jose"
ADMIN_PASSWORD = "Password1"

REQUEST_TIMEOUT = 30
DELAY_SECONDS = 2


def test_TC004_admin_post_receipt_between_8_30_days_past():
    session = requests.Session()

    # Step 1: Login as admin
    login_payload = {"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
    login_resp = session.post(LOGIN_URL, json=login_payload, timeout=REQUEST_TIMEOUT)
    assert login_resp.status_code == 200, f"Admin login failed: {login_resp.text}"
    login_data = login_resp.json()
    token = login_data.get("token")
    assert token and isinstance(token, str), "Admin login did not return a token"
    headers = {"Authorization": f"Bearer {token}"}
    time.sleep(DELAY_SECONDS)

    # Step 2: Get a valid itemId via GET /api/items
    items_resp = session.get(ITEMS_URL, headers=headers, timeout=REQUEST_TIMEOUT)
    assert items_resp.status_code == 200, f"Failed to get items: {items_resp.text}"
    items_data = items_resp.json()
    items = items_data.get("items")
    assert items and isinstance(items, list), "No items found or bad format"
    item = items[0]
    item_id = item.get("id")
    assert isinstance(item_id, int) and item_id > 0, "Invalid item ID from items list"
    time.sleep(DELAY_SECONDS)

    # Step 3: Get a valid vendorId via GET /api/vendors
    vendors_resp = session.get(VENDORS_URL, headers=headers, timeout=REQUEST_TIMEOUT)
    assert vendors_resp.status_code == 200, f"Failed to get vendors: {vendors_resp.text}"
    vendors_data = vendors_resp.json()
    vendors = vendors_data.get("vendors")
    assert vendors and isinstance(vendors, list), "No vendors found or bad format"
    vendor = vendors[0]
    vendor_id = vendor.get("id")
    assert isinstance(vendor_id, int) and vendor_id > 0, "Invalid vendor ID from vendors list"
    time.sleep(DELAY_SECONDS)

    # Step 4: Prepare receipt payload with transactionDate = 10 days ago
    transaction_date = (datetime.utcnow() - timedelta(days=10)).strftime("%Y-%m-%d")
    receipt_payload = {
        "itemId": item_id,
        "vendorId": vendor_id,
        "location": "ADEL",
        "quantity": 1,
        "unitCost": 10.00,
        "transactionDate": transaction_date
    }

    # Step 5: POST /api/transactions/receipts to create receipt transaction
    receipt_resp = session.post(RECEIPTS_URL, json=receipt_payload, headers=headers, timeout=REQUEST_TIMEOUT)
    assert receipt_resp.status_code == 201, f"Receipt creation failed: {receipt_resp.status_code} {receipt_resp.text}"
    receipt_data = receipt_resp.json()
    transaction = receipt_data.get("transaction")
    assert transaction and isinstance(transaction, dict), "Response missing transaction object"
    # Validate transaction fields roughly
    assert transaction.get("itemId") == item_id, "Transaction itemId mismatch"
    assert transaction.get("vendorId") == vendor_id, "Transaction vendorId mismatch"
    assert transaction.get("location") == "ADEL", "Transaction location mismatch"
    assert transaction.get("quantity") == 1, "Transaction quantity mismatch"
    assert abs(float(transaction.get("unitCost", 0)) - 10.00) < 0.01, "Transaction unitCost mismatch"
    # Compare only date portion of transactionDate
    response_date = transaction.get("transactionDate")
    assert response_date and response_date[:10] == transaction_date, "Transaction date mismatch"

    # Optional: Validate lastPaidPrice returned (can be null or number)
    last_paid_price = receipt_data.get("lastPaidPrice")
    assert (last_paid_price is None) or isinstance(last_paid_price, (int, float)), "lastPaidPrice missing or invalid"


test_TC004_admin_post_receipt_between_8_30_days_past()