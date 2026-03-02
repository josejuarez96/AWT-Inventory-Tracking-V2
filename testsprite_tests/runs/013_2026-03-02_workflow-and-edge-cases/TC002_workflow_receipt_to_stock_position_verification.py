import requests
import time

BASE_URL = "http://localhost:3002/api"
TIMEOUT = 30


def test_workflow_receipt_to_stock_position_verification():
    # Step 1: Login as user alix
    login_url = f"{BASE_URL}/auth/login"
    login_payload = {"username": "alix", "password": "Password1"}
    login_resp = requests.post(login_url, json=login_payload, timeout=TIMEOUT)
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    token = login_resp.json().get("token")
    assert token, "Token not found in login response"
    headers = {"Authorization": f"Bearer {token}"}
    time.sleep(2)

    # Step 2: GET /api/items to get first active itemId
    items_url = f"{BASE_URL}/items"
    items_resp = requests.get(items_url, headers=headers, timeout=TIMEOUT)
    assert items_resp.status_code == 200, f"Get items failed: {items_resp.text}"
    items = items_resp.json().get("items")
    assert items and isinstance(items, list) and len(items) > 0, "No items found"
    item_id = items[0].get("id")
    assert item_id is not None, "First item id missing"
    time.sleep(2)

    # GET /api/vendors to get first active vendorId
    vendors_url = f"{BASE_URL}/vendors"
    vendors_resp = requests.get(vendors_url, headers=headers, timeout=TIMEOUT)
    assert vendors_resp.status_code == 200, f"Get vendors failed: {vendors_resp.text}"
    vendors = vendors_resp.json().get("vendors")
    assert vendors and isinstance(vendors, list) and len(vendors) > 0, "No vendors found"
    vendor_id = vendors[0].get("id")
    assert vendor_id is not None, "First vendor id missing"
    time.sleep(2)

    # Step 3: GET /api/transactions/stock-position to find position for itemId and note adelQty
    stock_pos_url = f"{BASE_URL}/transactions/stock-position"
    stock_pos_resp_1 = requests.get(stock_pos_url, headers=headers, timeout=TIMEOUT)
    assert stock_pos_resp_1.status_code == 200, f"Stock position fetch failed: {stock_pos_resp_1.text}"
    positions_1 = stock_pos_resp_1.json().get("positions", [])
    adel_qty_before = None
    for pos in positions_1:
        item = pos.get("item")
        if item and item.get("id") == item_id:
            adel_qty_before = pos.get("adelQty")
            break
    assert adel_qty_before is not None, f"Item id {item_id} not found in stock positions"
    time.sleep(2)

    # Step 4: POST /api/transactions/receipts with given payload
    receipts_url = f"{BASE_URL}/transactions/receipts"
    receipt_payload = {
        "itemId": item_id,
        "vendorId": vendor_id,
        "location": "ADEL",
        "quantity": 25,
        "unitCost": 10.50,
        "transactionDate": "2026-02-19"
    }
    receipt_resp = requests.post(receipts_url, json=receipt_payload, headers=headers, timeout=TIMEOUT)
    assert receipt_resp.status_code == 201, f"Receipt creation failed: {receipt_resp.text}"
    receipt_json = receipt_resp.json()
    transaction = receipt_json.get("transaction")
    last_paid_price = receipt_json.get("lastPaidPrice")
    assert transaction, "Transaction object missing in response"
    assert last_paid_price is not None, "'lastPaidPrice' field missing or null"
    # Validate transaction fields
    trans_item = transaction.get("item")
    assert trans_item and trans_item.get("id") == item_id, "Transaction item ID mismatch"
    assert transaction.get("quantity") == 25, "Transaction quantity mismatch"
    assert transaction.get("location") == "ADEL", "Transaction location mismatch"
    time.sleep(2)

    # Step 5: GET /api/transactions/stock-position again, verify adelQty increased by 25
    stock_pos_resp_2 = requests.get(stock_pos_url, headers=headers, timeout=TIMEOUT)
    assert stock_pos_resp_2.status_code == 200, f"Stock position fetch failed: {stock_pos_resp_2.text}"
    positions_2 = stock_pos_resp_2.json().get("positions", [])
    adel_qty_after = None
    for pos in positions_2:
        item = pos.get("item")
        if item and item.get("id") == item_id:
            adel_qty_after = pos.get("adelQty")
            break
    assert adel_qty_after is not None, f"Item id {item_id} not found in stock positions after receipt"
    expected_after = adel_qty_before + 25
    assert adel_qty_after == expected_after, f"adelQty did not increase by 25 (before: {adel_qty_before}, after: {adel_qty_after})"
    time.sleep(2)

    # Step 6: GET /api/dashboard/activity -> verify 200 response with non-empty 'activity' array
    dashboard_activity_url = f"{BASE_URL}/dashboard/activity"
    dash_resp = requests.get(dashboard_activity_url, headers=headers, timeout=TIMEOUT)
    assert dash_resp.status_code == 200, f"Dashboard activity fetch failed: {dash_resp.text}"
    activity = dash_resp.json().get("activity")
    assert isinstance(activity, list) and len(activity) > 0, "Dashboard activity array empty or missing"


test_workflow_receipt_to_stock_position_verification()