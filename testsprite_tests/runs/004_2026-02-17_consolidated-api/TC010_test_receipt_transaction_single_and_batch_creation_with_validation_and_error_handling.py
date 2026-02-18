import requests

BASE_URL = "http://localhost:3000"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
ITEMS_URL = f"{BASE_URL}/api/items"
VENDORS_URL = f"{BASE_URL}/api/vendors"
RECEIPT_SINGLE_URL = f"{BASE_URL}/api/transactions/receipts"
RECEIPT_BATCH_URL = f"{BASE_URL}/api/transactions/receipts/batch"

TIMEOUT = 30


def test_receipt_transaction_single_and_batch_creation_with_validation_and_error_handling():
    # Step 1: Authenticate as user "jose"
    login_payload = {"username": "jose", "password": "password123"}
    login_resp = requests.post(LOGIN_URL, json=login_payload, timeout=TIMEOUT)
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    token = login_resp.json().get("token")
    assert token and isinstance(token, str), "Token missing or invalid in login response"
    headers = {"Authorization": f"Bearer {token}"}

    # Step 2: Get first item's id to use
    items_resp = requests.get(ITEMS_URL, headers=headers, timeout=TIMEOUT)
    assert items_resp.status_code == 200, f"Failed to get items: {items_resp.text}"
    items_json = items_resp.json()
    items_list = items_json.get("items")
    assert items_list and isinstance(items_list, list), "Items list missing or invalid"
    first_item = items_list[0]
    item_id = first_item.get("id")
    assert isinstance(item_id, int), "First item id invalid"

    # Step 3: Get first vendor's id to use
    vendors_resp = requests.get(VENDORS_URL, headers=headers, timeout=TIMEOUT)
    assert vendors_resp.status_code == 200, f"Failed to get vendors: {vendors_resp.text}"
    vendors_json = vendors_resp.json()
    vendors_list = vendors_json.get("vendors")
    assert vendors_list and isinstance(vendors_list, list), "Vendors list missing or invalid"
    first_vendor = vendors_list[0]
    vendor_id = first_vendor.get("id")
    assert isinstance(vendor_id, int), "First vendor id invalid"

    # Prepare common valid data for transaction date and other fields
    valid_location = "ADEL"
    valid_transaction_date = "2026-02-17"
    valid_quantity = 5
    valid_unit_cost = 10.5
    valid_invoice_number = "INV-TEST-001"
    valid_notes = "Test single receipt transaction"

    # --- Test single receipt creation (happy path) ---
    single_payload = {
        "itemId": item_id,
        "vendorId": vendor_id,
        "location": valid_location,
        "quantity": valid_quantity,
        "unitCost": valid_unit_cost,
        "transactionDate": valid_transaction_date,
        "invoiceNumber": valid_invoice_number,
        "notes": valid_notes,
    }

    single_resp = requests.post(RECEIPT_SINGLE_URL, headers=headers, json=single_payload, timeout=TIMEOUT)
    assert single_resp.status_code == 201, f"Single receipt creation failed: {single_resp.text}"
    single_json = single_resp.json()
    # Validate response fields
    transaction = single_json.get("transaction")
    last_paid_price = single_json.get("lastPaidPrice")
    assert transaction and isinstance(transaction, dict), "Missing or invalid 'transaction' in single receipt response"
    assert "item" in transaction and "vendor" in transaction and "user" in transaction, "Transaction missing required nested objects"
    assert isinstance(last_paid_price, (float, int)) or last_paid_price is None, "'lastPaidPrice' invalid type"

    # --- Test single receipt creation with invalid itemId (error path) ---
    invalid_item_payload = single_payload.copy()
    invalid_item_payload["itemId"] = 99999999  # Assuming non-existent ID
    invalid_item_resp = requests.post(RECEIPT_SINGLE_URL, headers=headers, json=invalid_item_payload, timeout=TIMEOUT)
    assert invalid_item_resp.status_code == 404, f"Expected 404 for invalid itemId, got {invalid_item_resp.status_code}"

    # --- Test single receipt creation with invalid vendorId (error path) ---
    invalid_vendor_payload = single_payload.copy()
    invalid_vendor_payload["vendorId"] = 99999999  # Assuming non-existent ID
    invalid_vendor_resp = requests.post(RECEIPT_SINGLE_URL, headers=headers, json=invalid_vendor_payload, timeout=TIMEOUT)
    assert invalid_vendor_resp.status_code == 404, f"Expected 404 for invalid vendorId, got {invalid_vendor_resp.status_code}"

    # --- Test single receipt creation with validation error (missing required field quantity) ---
    invalid_validation_payload = single_payload.copy()
    invalid_validation_payload.pop("quantity")
    invalid_validation_resp = requests.post(RECEIPT_SINGLE_URL, headers=headers, json=invalid_validation_payload, timeout=TIMEOUT)
    assert invalid_validation_resp.status_code == 400, f"Expected 400 for missing quantity, got {invalid_validation_resp.status_code}"

    # --- Test batch receipt creation (happy path) ---
    # Prepare batch payload
    batch_payload = {
        "vendorId": vendor_id,
        "location": valid_location,
        "transactionDate": valid_transaction_date,
        "invoiceNumber": "INV-BATCH-001",
        "notes": "Test batch receipt transaction",
        "lineItems": [
            {"itemId": item_id, "quantity": 3, "unitCost": 15.0},
        ],
    }

    batch_resp = requests.post(RECEIPT_BATCH_URL, headers=headers, json=batch_payload, timeout=TIMEOUT)
    assert batch_resp.status_code == 201, f"Batch receipt creation failed: {batch_resp.text}"
    batch_json = batch_resp.json()
    transactions = batch_json.get("transactions")
    last_paid_prices = batch_json.get("lastPaidPrices")
    assert isinstance(transactions, list) and len(transactions) > 0, "Missing or invalid 'transactions' list in batch response"
    for tx in transactions:
        assert "item" in tx and "vendor" in tx and "user" in tx, "Transaction missing required nested objects in batch response"
    assert isinstance(last_paid_prices, dict), "'lastPaidPrices' should be a dict mapping item IDs to prices"
    # Validate keys in lastPaidPrices are strings of item IDs and values are numbers or null
    for k, v in last_paid_prices.items():
        assert isinstance(k, str), "Key in lastPaidPrices is not string"
        assert (isinstance(v, (float, int)) or v is None), "Value in lastPaidPrices invalid"

    # --- Test batch receipt creation with missing lineItems (validation error) ---
    batch_missing_lineitems = batch_payload.copy()
    batch_missing_lineitems.pop("lineItems")
    batch_missing_resp = requests.post(RECEIPT_BATCH_URL, headers=headers, json=batch_missing_lineitems, timeout=TIMEOUT)
    assert batch_missing_resp.status_code == 400, f"Expected 400 for missing lineItems, got {batch_missing_resp.status_code}"

    # --- Test batch receipt creation with invalid itemId in lineItems (error path) ---
    batch_invalid_item = batch_payload.copy()
    batch_invalid_item["lineItems"] = [
        {"itemId": 99999999, "quantity": 1, "unitCost": 10.0}
    ]
    batch_invalid_item_resp = requests.post(RECEIPT_BATCH_URL, headers=headers, json=batch_invalid_item, timeout=TIMEOUT)
    assert batch_invalid_item_resp.status_code == 404, f"Expected 404 for invalid itemId in batch lineItems, got {batch_invalid_item_resp.status_code}"

    # --- Test batch receipt creation with invalid vendorId (error path) ---
    batch_invalid_vendor = batch_payload.copy()
    batch_invalid_vendor["vendorId"] = 99999999
    batch_invalid_vendor_resp = requests.post(RECEIPT_BATCH_URL, headers=headers, json=batch_invalid_vendor, timeout=TIMEOUT)
    assert batch_invalid_vendor_resp.status_code == 404, f"Expected 404 for invalid vendorId in batch, got {batch_invalid_vendor_resp.status_code}"

    # --- Test batch receipt creation with validation error on lineItems (quantity = 0) ---
    batch_validation_error = batch_payload.copy()
    batch_validation_error["lineItems"] = [{"itemId": item_id, "quantity": 0, "unitCost": 10.0}]
    batch_validation_error_resp = requests.post(RECEIPT_BATCH_URL, headers=headers, json=batch_validation_error, timeout=TIMEOUT)
    assert batch_validation_error_resp.status_code == 400, f"Expected 400 for invalid quantity in lineItems, got {batch_validation_error_resp.status_code}"


test_receipt_transaction_single_and_batch_creation_with_validation_and_error_handling()