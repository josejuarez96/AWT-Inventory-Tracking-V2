import requests
import time

BASE_URL = "http://localhost:3002/api"
TIMEOUT = 30

def test_workflow_production_kitting_with_stock_consumption():
    # Step 1: Login as admin
    login_resp = requests.post(
        f"{BASE_URL}/auth/login",
        json={"username": "jose", "password": "Password1"},
        timeout=TIMEOUT,
    )
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    token = login_resp.json().get("token")
    assert token, "No token received"
    headers = {"Authorization": f"Bearer {token}"}
    time.sleep(2)

    # Step 2: GET /api/items to identify finishedGoodId and 2 componentIds
    items_resp = requests.get(f"{BASE_URL}/items", headers=headers, timeout=TIMEOUT)
    assert items_resp.status_code == 200, f"Failed to get items: {items_resp.text}"
    items = items_resp.json().get("items", [])
    assert len(items) >= 3, "Not enough items to select finished good and 2 components"
    finished_good = items[0]
    comp1 = items[1]
    comp2 = items[2]
    finishedGoodId = finished_good["id"]
    comp1Id = comp1["id"]
    comp2Id = comp2["id"]
    time.sleep(2)

    # Step 3: Ensure components have stock by creating receipts for each component at ADEL
    # Get a valid vendor id from /api/vendors
    vendors_resp = requests.get(f"{BASE_URL}/vendors", headers=headers, timeout=TIMEOUT)
    assert vendors_resp.status_code == 200, f"Failed to get vendors: {vendors_resp.text}"
    vendors = vendors_resp.json().get("vendors", [])
    assert len(vendors) >= 1, "No vendors found"
    vendorId = vendors[0]["id"]
    time.sleep(2)
    receipt_date = "2026-02-19"
    for compId in (comp1Id, comp2Id):
        receipt_payload = {
            "itemId": compId,
            "vendorId": vendorId,
            "location": "ADEL",
            "quantity": 50,
            "unitCost": 5.00,
            "transactionDate": receipt_date,
        }
        receipt_resp = requests.post(
            f"{BASE_URL}/transactions/receipts", headers=headers, json=receipt_payload, timeout=TIMEOUT
        )
        assert receipt_resp.status_code == 201, f"Failed to create receipt for item {compId}: {receipt_resp.text}"
        time.sleep(2)

    # Step 4: Create and activate a BOM
    bom_payload = {
        "bomCode": "WF-KIT-BOM",
        "name": "Kit Test",
        "finishedGoodId": finishedGoodId,
        "lines": [
            {"itemId": comp1Id, "quantityPer": 2},
            {"itemId": comp2Id, "quantityPer": 3}
        ]
    }
    bom_resp = requests.post(f"{BASE_URL}/boms", headers=headers, json=bom_payload, timeout=TIMEOUT)
    assert bom_resp.status_code == 201, f"Failed to create BOM: {bom_resp.text}"
    bom = bom_resp.json().get("bom")
    assert bom, "No BOM returned"
    bomId = bom["id"]
    time.sleep(2)

    patch_status_payload = {"status": "ACTIVE"}
    patch_resp = requests.patch(
        f"{BASE_URL}/boms/{bomId}/status",
        headers=headers,
        json=patch_status_payload,
        timeout=TIMEOUT,
    )
    assert patch_resp.status_code == 200, f"Failed to activate BOM: {patch_resp.text}"
    patch_data = patch_resp.json()
    assert patch_data.get("status") == "ACTIVE", "BOM status not ACTIVE"
    time.sleep(2)

    # Step 5: GET stock positions, note component and finished good stock at ADEL
    stock_resp_1 = requests.get(f"{BASE_URL}/transactions/stock-position", headers=headers, timeout=TIMEOUT)
    assert stock_resp_1.status_code == 200, f"Failed to get stock position: {stock_resp_1.text}"
    positions_1 = stock_resp_1.json().get("positions", [])
    def find_position(itemId, positions):
        for p in positions:
            if p["item"]["id"] == itemId:
                return p
        return None

    comp1_pos_before = find_position(comp1Id, positions_1)
    comp2_pos_before = find_position(comp2Id, positions_1)
    finished_good_pos_before = find_position(finishedGoodId, positions_1)
    assert comp1_pos_before and comp2_pos_before and finished_good_pos_before, \
        "Stock position missing items"
    comp1_stock_before = comp1_pos_before.get("adelQty", 0)
    comp2_stock_before = comp2_pos_before.get("adelQty", 0)
    finished_good_stock_before = finished_good_pos_before.get("adelQty", 0)
    time.sleep(2)

    # Step 6: Execute production kit
    production_payload = {
        "finishedGoodId": finishedGoodId,
        "location": "ADEL",
        "quantityProduced": 5,
        "bomId": bomId,
        "components": [
            {"itemId": comp1Id, "quantityPer": 2},
            {"itemId": comp2Id, "quantityPer": 3}
        ]
    }
    production_resp = requests.post(
        f"{BASE_URL}/production/kit", headers=headers, json=production_payload, timeout=TIMEOUT
    )
    assert production_resp.status_code == 201, f"Failed to create production kit: {production_resp.text}"
    order = production_resp.json().get("order")
    assert order, "No production order returned"
    order_id = order.get("id")
    orderNumber = order.get("orderNumber", "")
    totalCost = order.get("totalCost", 0)
    transactions = order.get("transactions", [])
    assert orderNumber.startswith("KIT-"), "orderNumber missing KIT- prefix"
    assert totalCost > 0, "totalCost not greater than 0"
    assert isinstance(transactions, list) and len(transactions) > 0, "No transactions in production order"
    time.sleep(2)

    # Step 7: GET stock positions again and verify component stock decreased and finished good increased
    stock_resp_2 = requests.get(f"{BASE_URL}/transactions/stock-position", headers=headers, timeout=TIMEOUT)
    assert stock_resp_2.status_code == 200, f"Failed to get stock position (step7): {stock_resp_2.text}"
    positions_2 = stock_resp_2.json().get("positions", [])
    comp1_pos_after = find_position(comp1Id, positions_2)
    comp2_pos_after = find_position(comp2Id, positions_2)
    finished_good_pos_after = find_position(finishedGoodId, positions_2)
    assert comp1_pos_after and comp2_pos_after and finished_good_pos_after, \
        "Stock position missing items after production"
    comp1_stock_after = comp1_pos_after.get("adelQty", 0)
    comp2_stock_after = comp2_pos_after.get("adelQty", 0)
    finished_good_stock_after = finished_good_pos_after.get("adelQty", 0)

    assert comp1_stock_after == comp1_stock_before - (5*2), \
        f"comp1 adelQty expected {comp1_stock_before - (5*2)}, got {comp1_stock_after}"
    assert comp2_stock_after == comp2_stock_before - (5*3), \
        f"comp2 adelQty expected {comp2_stock_before - (5*3)}, got {comp2_stock_after}"
    assert finished_good_stock_after == finished_good_stock_before + 5, \
        f"finishedGood adelQty expected {finished_good_stock_before + 5}, got {finished_good_stock_after}"
    time.sleep(2)

    # Step 8: GET /api/production -> verify production order appears in list
    production_list_resp = requests.get(f"{BASE_URL}/production", headers=headers, timeout=TIMEOUT)
    assert production_list_resp.status_code == 200, f"Failed to get production list: {production_list_resp.text}"
    orders = production_list_resp.json().get("orders", [])
    assert any(o.get("id") == order_id for o in orders), "Production order not found in list"
    time.sleep(2)

    # Step 9: GET /api/production/:orderId -> verify order detail with linked transactions
    production_detail_resp = requests.get(f"{BASE_URL}/production/{order_id}", headers=headers, timeout=TIMEOUT)
    assert production_detail_resp.status_code == 200, f"Failed to get production order detail: {production_detail_resp.text}"
    order_detail = production_detail_resp.json().get("order")
    assert order_detail, "No production order detail"
    linked_transactions = order_detail.get("transactions", [])
    assert len(linked_transactions) > 0, "No linked transactions in production order detail"
    time.sleep(2)

    # Step 10: POST /api/production/kit with quantity 99999 -> expect 400 insufficient stock with insufficientItems
    large_production_payload = {
        "finishedGoodId": finishedGoodId,
        "location": "ADEL",
        "quantityProduced": 99999,
        "bomId": bomId,
        "components": [
            {"itemId": comp1Id, "quantityPer": 2},
            {"itemId": comp2Id, "quantityPer": 3}
        ]
    }
    large_prod_resp = requests.post(
        f"{BASE_URL}/production/kit", headers=headers, json=large_production_payload, timeout=TIMEOUT
    )
    assert large_prod_resp.status_code == 400, "Expected 400 error due to insufficient stock"
    error_json = large_prod_resp.json()
    insufficient = error_json.get("insufficientItems")
    assert insufficient and isinstance(insufficient, list) and len(insufficient) > 0, "Expected insufficientItems list in error"

test_workflow_production_kitting_with_stock_consumption()