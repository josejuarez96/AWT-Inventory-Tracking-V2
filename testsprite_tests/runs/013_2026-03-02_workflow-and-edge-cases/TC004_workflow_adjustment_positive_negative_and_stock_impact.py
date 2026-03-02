import requests
import time

BASE_URL = "http://localhost:3002/api"
TIMEOUT = 30

def test_workflow_adjustment_positive_negative_and_stock_impact():
    session = requests.Session()

    # Step 1: Login as user (alix/Password1)
    login_payload = {"username": "alix", "password": "Password1"}
    login_resp = session.post(f"{BASE_URL}/auth/login", json=login_payload, timeout=TIMEOUT)
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    token_data = login_resp.json()
    token = token_data.get("token")
    assert token, "No token received on login"
    headers = {"Authorization": f"Bearer {token}"}
    time.sleep(2)

    # Step 2: GET /api/items to get a valid itemId (use the first item)
    items_resp = session.get(f"{BASE_URL}/items", headers=headers, timeout=TIMEOUT)
    assert items_resp.status_code == 200, f"Failed to get items: {items_resp.text}"
    items_data = items_resp.json()
    items = items_data.get("items")
    assert items and isinstance(items, list), "Items list missing or empty"
    item = items[0]
    item_id = item.get("id")
    assert item_id, "Item id not found in first item"
    time.sleep(2)

    # Step 3: GET /api/transactions/stock-position, find position for itemId, note adelQty (>0)
    stock_resp = session.get(f"{BASE_URL}/transactions/stock-position", headers=headers, timeout=TIMEOUT)
    assert stock_resp.status_code == 200, f"Failed to get stock positions: {stock_resp.text}"
    stock_data = stock_resp.json()
    positions = stock_data.get("positions")
    assert positions and isinstance(positions, list), "Positions list missing or empty"
    adel_qty_before = None
    for pos in positions:
        pos_item = pos.get("item")
        if pos_item and pos_item.get("id") == item_id:
            adel_qty_before = pos.get("adelQty")
            break
    assert adel_qty_before is not None, f"Position for itemId {item_id} not found"
    assert adel_qty_before > 0, f"Initial adelQty must be > 0 but got {adel_qty_before}"
    time.sleep(2)

    # Step 4: POST /api/transactions/adjustments with quantity=5 and reason Correction
    adjustment_1_payload = {
        "itemId": item_id,
        "location": "ADEL",
        "quantity": 5,
        "reason": "Correction",
        "notes": "Adding found stock"
    }
    adj1_resp = session.post(f"{BASE_URL}/transactions/adjustments", headers=headers, json=adjustment_1_payload, timeout=TIMEOUT)
    assert adj1_resp.status_code == 201, f"Adjustment +5 failed: {adj1_resp.text}"
    adj1_data = adj1_resp.json()
    transaction_1 = adj1_data.get("transaction")
    assert transaction_1, "No transaction object in +5 adjustment response"
    assert transaction_1.get("item", {}).get("id") == item_id, "Transaction itemId mismatch in +5 adjustment"
    time.sleep(2)

    # Step 5: GET /api/transactions/stock-position, verify adelQty increased by 5
    stock_resp_2 = session.get(f"{BASE_URL}/transactions/stock-position", headers=headers, timeout=TIMEOUT)
    assert stock_resp_2.status_code == 200, f"Failed to get stock positions after +5 adjustment: {stock_resp_2.text}"
    stock_data_2 = stock_resp_2.json()
    positions_2 = stock_data_2.get("positions")
    adel_qty_after_5 = None
    for pos in positions_2:
        pos_item = pos.get("item")
        if pos_item and pos_item.get("id") == item_id:
            adel_qty_after_5 = pos.get("adelQty")
            break
    assert adel_qty_after_5 is not None, f"Position for itemId {item_id} not found after +5 adjustment"
    expected_qty_after_5 = adel_qty_before + 5
    assert adel_qty_after_5 == expected_qty_after_5, f"adelQty after +5 adjustment expected {expected_qty_after_5}, got {adel_qty_after_5}"
    time.sleep(2)

    # Step 6: POST /api/transactions/adjustments with quantity=-2 and reason Damage
    adjustment_2_payload = {
        "itemId": item_id,
        "location": "ADEL",
        "quantity": -2,
        "reason": "Damage",
        "notes": "Damaged units"
    }
    adj2_resp = session.post(f"{BASE_URL}/transactions/adjustments", headers=headers, json=adjustment_2_payload, timeout=TIMEOUT)
    assert adj2_resp.status_code == 201, f"Adjustment -2 failed: {adj2_resp.text}"
    adj2_data = adj2_resp.json()
    transaction_2 = adj2_data.get("transaction")
    assert transaction_2, "No transaction object in -2 adjustment response"
    assert transaction_2.get("item", {}).get("id") == item_id, "Transaction itemId mismatch in -2 adjustment"
    time.sleep(2)

    # Step 7: GET /api/transactions/stock-position, verify adelQty now increased by 3 (net +5 then -2)
    stock_resp_3 = session.get(f"{BASE_URL}/transactions/stock-position", headers=headers, timeout=TIMEOUT)
    assert stock_resp_3.status_code == 200, f"Failed to get stock positions after -2 adjustment: {stock_resp_3.text}"
    stock_data_3 = stock_resp_3.json()
    positions_3 = stock_data_3.get("positions")
    adel_qty_after_neg2 = None
    for pos in positions_3:
        pos_item = pos.get("item")
        if pos_item and pos_item.get("id") == item_id:
            adel_qty_after_neg2 = pos.get("adelQty")
            break
    assert adel_qty_after_neg2 is not None, f"Position for itemId {item_id} not found after -2 adjustment"
    expected_qty_after_neg2 = adel_qty_before + 3  # 5 - 2 = 3 net increase from original
    assert adel_qty_after_neg2 == expected_qty_after_neg2, f"adelQty after -2 adjustment expected {expected_qty_after_neg2}, got {adel_qty_after_neg2}"
    time.sleep(2)

    # Step 8: POST /api/transactions/adjustments with quantity=0 and reason Correction -> expect 400
    adjustment_0_payload = {
        "itemId": item_id,
        "location": "ADEL",
        "quantity": 0,
        "reason": "Correction"
    }
    adj0_resp = session.post(f"{BASE_URL}/transactions/adjustments", headers=headers, json=adjustment_0_payload, timeout=TIMEOUT)
    assert adj0_resp.status_code == 400, f"Adjustment with zero quantity should fail with 400, got {adj0_resp.status_code}"

test_workflow_adjustment_positive_negative_and_stock_impact()