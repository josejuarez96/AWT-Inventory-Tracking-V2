import requests
import time

BASE_URL = "http://localhost:3002/api"
TIMEOUT = 30


def test_workflow_batch_receipt_and_stock_verification():
    # Step 1: Login as user (alix/Password1)
    login_url = f"{BASE_URL}/auth/login"
    login_payload = {"username": "alix", "password": "Password1"}
    resp = requests.post(login_url, json=login_payload, timeout=TIMEOUT)
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    token = resp.json().get("token")
    assert token, "Login response missing token"
    headers = {"Authorization": f"Bearer {token}"}
    time.sleep(2)

    # Step 2: GET /api/items to get first 2 active itemIds
    items_url = f"{BASE_URL}/items"
    resp = requests.get(items_url, headers=headers, timeout=TIMEOUT)
    assert resp.status_code == 200, f"Get items failed: {resp.text}"
    items = resp.json().get("items")
    assert isinstance(items, list) and len(items) >= 2, "Less than 2 active items returned"
    item1_id = items[0].get("id")
    item2_id = items[1].get("id")
    assert isinstance(item1_id, int) and isinstance(item2_id, int), "Invalid item IDs"
    time.sleep(2)

    # GET /api/vendors to get first vendorId
    vendors_url = f"{BASE_URL}/vendors"
    resp = requests.get(vendors_url, headers=headers, timeout=TIMEOUT)
    assert resp.status_code == 200, f"Get vendors failed: {resp.text}"
    vendors = resp.json().get("vendors")
    assert isinstance(vendors, list) and len(vendors) >= 1, "No active vendors returned"
    vendor_id = vendors[0].get("id")
    assert isinstance(vendor_id, int), "Invalid vendor ID"
    time.sleep(2)

    # Step 3: GET /api/transactions/stock-position, find positions for both items and note adelQty
    stock_pos_url = f"{BASE_URL}/transactions/stock-position"
    resp = requests.get(stock_pos_url, headers=headers, timeout=TIMEOUT)
    assert resp.status_code == 200, f"Get stock position failed: {resp.text}"
    positions = resp.json().get("positions")
    assert isinstance(positions, list), "Positions not returned as list"

    def find_adel_qty(item_id):
        for pos in positions:
            item = pos.get("item")
            if item and item.get("id") == item_id:
                return pos.get("adelQty", 0)
        return None

    item1_adel_qty_before = find_adel_qty(item1_id)
    item2_adel_qty_before = find_adel_qty(item2_id)
    assert item1_adel_qty_before is not None, f"Item1 adelQty not found in stock positions"
    assert item2_adel_qty_before is not None, f"Item2 adelQty not found in stock positions"
    time.sleep(2)

    # Step 4: POST /api/transactions/receipts/batch with batch receipt
    batch_url = f"{BASE_URL}/transactions/receipts/batch"
    batch_payload = {
        "vendorId": vendor_id,
        "location": "ADEL",
        "transactionDate": "2026-02-19",
        "lineItems": [
            {"itemId": item1_id, "quantity": 10, "unitCost": 5.00},
            {"itemId": item2_id, "quantity": 20, "unitCost": 8.00}
        ]
    }
    resp = requests.post(batch_url, headers=headers, json=batch_payload, timeout=TIMEOUT)
    assert resp.status_code == 201, f"Batch receipt failed: {resp.text}"
    resp_json = resp.json()
    transactions = resp_json.get("transactions")
    last_paid_prices = resp_json.get("lastPaidPrices")
    assert isinstance(transactions, list) and len(transactions) == 2, "Transactions array length not 2"
    assert isinstance(last_paid_prices, dict), "lastPaidPrices not present or not a dict"
    # Verify each transaction corresponds to requested items with correct quantities and location
    item_ids_received = set()
    for trx in transactions:
        item = trx.get("item")
        assert item and "id" in item, "Transaction missing item with id"
        item_id = item["id"]
        assert item_id in (item1_id, item2_id), f"Unexpected item id {item_id} in transactions"
        item_ids_received.add(item_id)
        quantity = trx.get("quantity")
        assert (item_id == item1_id and quantity == 10) or (item_id == item2_id and quantity == 20), \
            f"Quantity mismatch in transaction for item {item_id}"
        location = trx.get("location")
        assert location == "ADEL", f"Transaction location not ADEL for item {item_id}"

    # Both items must be in transactions
    assert item_ids_received == {item1_id, item2_id}, "Not all item transactions included"
    time.sleep(2)

    # Step 5: GET /api/transactions/stock-position again, verify adelQty increased accordingly
    resp = requests.get(stock_pos_url, headers=headers, timeout=TIMEOUT)
    assert resp.status_code == 200, f"Get stock position failed second time: {resp.text}"
    positions_after = resp.json().get("positions")
    assert isinstance(positions_after, list), "Positions not returned as list"

    def find_adel_qty_after(item_id):
        for pos in positions_after:
            item = pos.get("item")
            if item and item.get("id") == item_id:
                return pos.get("adelQty", 0)
        return None

    item1_adel_qty_after = find_adel_qty_after(item1_id)
    item2_adel_qty_after = find_adel_qty_after(item2_id)
    assert item1_adel_qty_after is not None, f"Item1 adelQty not found after batch receipt"
    assert item2_adel_qty_after is not None, f"Item2 adelQty not found after batch receipt"
    assert item1_adel_qty_after == item1_adel_qty_before + 10, \
        f"Item1 adelQty increase mismatch: before {item1_adel_qty_before}, after {item1_adel_qty_after}"
    assert item2_adel_qty_after == item2_adel_qty_before + 20, \
        f"Item2 adelQty increase mismatch: before {item2_adel_qty_before}, after {item2_adel_qty_after}"

    # Test complete


test_workflow_batch_receipt_and_stock_verification()