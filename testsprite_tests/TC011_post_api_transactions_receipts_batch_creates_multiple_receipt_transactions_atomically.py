import requests

BASE_URL = "http://localhost:3000"
LOGIN_ENDPOINT = "/api/auth/login"
VENDORS_ENDPOINT = "/api/vendors"
ITEMS_ENDPOINT = "/api/items"
BATCH_RECEIPTS_ENDPOINT = "/api/transactions/receipts/batch"
TIMEOUT = 30

def test_post_api_transactions_receipts_batch_creates_multiple_receipt_transactions_atomically():
    # Login to get JWT token
    login_payload = {"username": "jose", "password": "password123"}
    login_resp = requests.post(
        BASE_URL + LOGIN_ENDPOINT, json=login_payload, timeout=TIMEOUT
    )
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    login_data = login_resp.json()
    token = login_data.get("token")
    assert token, "Token missing in login response"
    headers = {"Authorization": f"Bearer {token}"}

    # Get vendors to obtain a valid vendorId
    vendors_resp = requests.get(BASE_URL + VENDORS_ENDPOINT, headers=headers, timeout=TIMEOUT)
    assert vendors_resp.status_code == 200, f"Failed to get vendors: {vendors_resp.text}"
    vendors_data = vendors_resp.json()
    vendors = vendors_data.get("vendors")
    assert vendors and isinstance(vendors, list) and len(vendors) > 0, "No vendors found"
    vendor_id = vendors[0].get("id")
    assert isinstance(vendor_id, int), "Invalid vendorId"

    # Get items to obtain first two valid itemIds
    items_resp = requests.get(BASE_URL + ITEMS_ENDPOINT, headers=headers, timeout=TIMEOUT)
    assert items_resp.status_code == 200, f"Failed to get items: {items_resp.text}"
    items_data = items_resp.json()
    items = items_data.get("items")
    assert items and isinstance(items, list) and len(items) >= 2, "Less than 2 items found"
    item1 = items[0]
    item2 = items[1]
    item1_id = item1.get("id")
    item2_id = item2.get("id")
    assert isinstance(item1_id, int), "Invalid item1 id"
    assert isinstance(item2_id, int), "Invalid item2 id"

    # Prepare batch receipt payload
    batch_payload = {
        "vendorId": vendor_id,
        "location": "ADEL",
        "transactionDate": "2026-02-17",
        "invoiceNumber": "BATCH-TEST-001",
        "lineItems": [
            {"itemId": item1_id, "quantity": 3, "unitCost": 15.00},
            {"itemId": item2_id, "quantity": 7, "unitCost": 22.50},
        ],
    }

    # Post batch receipts
    batch_resp = requests.post(
        BASE_URL + BATCH_RECEIPTS_ENDPOINT,
        json=batch_payload,
        headers=headers,
        timeout=TIMEOUT,
    )
    assert batch_resp.status_code == 201, f"Batch receipts creation failed: {batch_resp.text}"
    batch_data = batch_resp.json()

    transactions = batch_data.get("transactions")
    last_paid_prices = batch_data.get("lastPaidPrices")

    # Validate response structure
    assert isinstance(transactions, list), "'transactions' is not a list"
    assert len(transactions) == 2, f"Expected 2 transactions, got {len(transactions)}"
    assert isinstance(last_paid_prices, dict), "'lastPaidPrices' is not a dict"

    # Verify each transaction
    for txn, expected_line_item in zip(transactions, batch_payload["lineItems"]):
        # transactionType RECEIPT
        txn_type = txn.get("transactionType")
        assert txn_type == "RECEIPT", f"Expected transactionType 'RECEIPT', got {txn_type}"

        # Verify quantities and unit costs match line item
        quantity = txn.get("quantity")
        unit_cost = txn.get("unitCost")
        assert quantity == expected_line_item["quantity"], \
            f"Expected quantity {expected_line_item['quantity']}, got {quantity}"
        assert unit_cost == expected_line_item["unitCost"], \
            f"Expected unitCost {expected_line_item['unitCost']}, got {unit_cost}"

        # Verify item nested object has required fields
        item_obj = txn.get("item")
        assert item_obj and isinstance(item_obj, dict), "Transaction missing 'item' object"
        assert item_obj.get("id") == expected_line_item["itemId"], \
            f"Transaction item id mismatch: expected {expected_line_item['itemId']}, got {item_obj.get('id')}"
        for field in ["itemCode", "description"]:
            assert field in item_obj, f"Missing '{field}' in item object"

    # Verify lastPaidPrices keys cover the itemIds
    last_paid_keys = set(last_paid_prices.keys())
    expected_item_ids = {str(item1_id), str(item2_id)}
    assert expected_item_ids.issubset(last_paid_keys), \
        f"lastPaidPrices keys {last_paid_keys} do not include expected itemIds {expected_item_ids}"

test_post_api_transactions_receipts_batch_creates_multiple_receipt_transactions_atomically()