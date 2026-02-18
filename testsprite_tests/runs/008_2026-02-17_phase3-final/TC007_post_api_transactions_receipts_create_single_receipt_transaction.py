import requests
from datetime import datetime
import time

BASE_URL = "http://localhost:3002"
ADMIN_CREDENTIALS = {"username": "jose", "password": "Password1"}
USER_CREDENTIALS = {"username": "alix", "password": "Password1"}
TIMEOUT = 30


def test_post_api_transactions_receipts_create_single_receipt_transaction():
    # Step 1: Login as standard user (alix) to get auth token
    login_resp = requests.post(
        f"{BASE_URL}/api/auth/login",
        json=USER_CREDENTIALS,
        timeout=TIMEOUT,
    )
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    token = login_resp.json().get("token")
    assert token, "No token in login response"
    headers = {"Authorization": f"Bearer {token}"}

    # Step 2: Get list of items and vendors to select valid itemId and vendorId
    items_resp = requests.get(
        f"{BASE_URL}/api/items",
        headers=headers,
        timeout=TIMEOUT,
    )
    assert items_resp.status_code == 200, f"Get items failed: {items_resp.text}"
    items = items_resp.json().get("items", [])
    assert items, "No items found to use for receipt transaction"
    # Select first active item with id and lastPurchaseCost
    item = next((i for i in items if i.get("id") and i.get("lastPurchaseCost") is not None), items[0])
    item_id = item["id"]

    vendors_resp = requests.get(
        f"{BASE_URL}/api/vendors",
        headers=headers,
        timeout=TIMEOUT,
    )
    assert vendors_resp.status_code == 200, f"Get vendors failed: {vendors_resp.text}"
    vendors = vendors_resp.json().get("vendors", [])
    assert vendors, "No vendors found to use for receipt transaction"
    vendor_id = vendors[0]["id"]

    # Step 3: Prepare receipt transaction data with valid fields
    # Use current date as transactionDate in ISO 8601 date format (YYYY-MM-DD)
    transaction_date = datetime.utcnow().date().isoformat()
    location = "ADEL"  # Use one valid location per PRD enum
    quantity = 10
    unit_cost = 25.5
    invoice_number = "INV-123456"
    notes = "Test receipt transaction creation"

    receipt_payload = {
        "itemId": item_id,
        "vendorId": vendor_id,
        "location": location,
        "quantity": quantity,
        "unitCost": unit_cost,
        "transactionDate": transaction_date,
        "invoiceNumber": invoice_number,
        "notes": notes,
    }

    # Step 4: POST /api/transactions/receipts to create receipt transaction
    post_resp = requests.post(
        f"{BASE_URL}/api/transactions/receipts",
        headers={**headers, "Content-Type": "application/json"},
        json=receipt_payload,
        timeout=TIMEOUT,
    )
    assert post_resp.status_code == 201, f"Receipt creation failed: {post_resp.text}"
    resp_json = post_resp.json()
    transaction = resp_json.get("transaction")
    last_paid_price = resp_json.get("lastPaidPrice")

    # Step 5: Validate response contains transaction object and lastPaidPrice is a number or null
    assert transaction, "Response missing transaction object"
    assert "id" in transaction, "Transaction object missing id"
    assert isinstance(last_paid_price, (float, int)) or last_paid_price is None, "Invalid lastPaidPrice type"

    # Step 6: Validate transaction fields reflect input data
    assert transaction.get("itemId") == item_id or (transaction.get("item") and transaction["item"].get("id") == item_id), "Transaction itemId mismatch"
    assert transaction.get("vendorId") == vendor_id or (transaction.get("vendor") and transaction["vendor"].get("id") == vendor_id), "Transaction vendorId mismatch"
    assert transaction.get("location") == location, "Transaction location mismatch"
    assert abs(float(transaction.get("quantity", 0)) - quantity) < 1e-6, "Transaction quantity mismatch"
    assert abs(float(transaction.get("unitCost", 0)) - unit_cost) < 1e-6, "Transaction unitCost mismatch"
    # transactionDate check allowing possible time variations, ensure same date
    trans_date_str = transaction.get("transactionDate")
    assert trans_date_str, "Transaction missing transactionDate"
    try:
        trans_date = datetime.fromisoformat(trans_date_str).date()
    except Exception:
        assert False, "transactionDate in transaction is not a valid ISO 8601 date"
    assert trans_date.isoformat() == transaction_date, "TransactionDate mismatch"

    # Step 7: GET /api/items/:id to check lastPurchaseCost updated to unitCost
    item_detail_resp = requests.get(
        f"{BASE_URL}/api/items/{item_id}",
        headers=headers,
        timeout=TIMEOUT,
    )
    assert item_detail_resp.status_code == 200, f"Get item detail failed: {item_detail_resp.text}"
    item_detail = item_detail_resp.json().get("item")
    assert item_detail, "Item detail missing"
    last_purchase_cost = item_detail.get("lastPurchaseCost")
    assert last_purchase_cost is not None, "Item lastPurchaseCost missing"
    # lastPurchaseCost should be updated to the unitCost used in the receipt (or close float equal)
    assert abs(float(last_purchase_cost) - unit_cost) < 1e-6, f"Item lastPurchaseCost not updated, expected {unit_cost} got {last_purchase_cost}"


test_post_api_transactions_receipts_create_single_receipt_transaction()