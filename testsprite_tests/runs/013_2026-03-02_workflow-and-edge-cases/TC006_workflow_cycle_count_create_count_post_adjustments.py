import requests
import time

BASE_URL = "http://localhost:3002/api"
ADMIN_USERNAME = "jose"
ADMIN_PASSWORD = "Password1"
TIMEOUT = 30

def test_workflow_cycle_count_create_count_post_adjustments():
    session = requests.Session()

    def delay():
        time.sleep(2)

    # Step 1: Login as admin (jose/Password1).
    login_resp = session.post(
        f"{BASE_URL}/auth/login",
        json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD},
        timeout=TIMEOUT,
    )
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    token = login_resp.json().get("token")
    assert token, "No token in login response"
    headers = {"Authorization": f"Bearer {token}"}
    delay()

    # Step 2: GET /api/items to get 2 valid active itemIds.
    items_resp = session.get(f"{BASE_URL}/items", headers=headers, timeout=TIMEOUT)
    assert items_resp.status_code == 200, f"Get items failed: {items_resp.text}"
    items = items_resp.json().get("items")
    assert items and len(items) >= 2, "Less than 2 active items found"
    item1 = items[0]
    item2 = items[1]
    item1_id = item1["id"]
    item2_id = item2["id"]
    delay()

    # Step 3: GET /api/transactions/stock-position to note current stock for those items at ADEL.
    stock_pos_resp = session.get(f"{BASE_URL}/transactions/stock-position", headers=headers, timeout=TIMEOUT)
    assert stock_pos_resp.status_code == 200, f"Get stock position failed: {stock_pos_resp.text}"
    positions = stock_pos_resp.json().get("positions", [])
    # Map itemId to adelQty for easy reference
    adel_qty_map = {}
    for pos in positions:
        if "item" in pos and pos["item"]["id"] in [item1_id, item2_id]:
            adel_qty_map[pos["item"]["id"]] = pos.get("adelQty", 0)
    # Ensure we have adelQty for both items
    assert item1_id in adel_qty_map and item2_id in adel_qty_map, "Adel qty info missing for items"
    adel_qty_1 = adel_qty_map[item1_id]
    adel_qty_2 = adel_qty_map[item2_id]
    delay()

    # Step 4: POST /api/cycle-counts with {location:'ADEL', itemSelection:'manual', itemIds:[id1,id2], blindCount:false}
    post_body = {
        "location": "ADEL",
        "itemSelection": "manual",
        "itemIds": [item1_id, item2_id],
        "blindCount": False
    }
    cycle_count_create_resp = session.post(f"{BASE_URL}/cycle-counts", json=post_body, headers=headers, timeout=TIMEOUT)
    assert cycle_count_create_resp.status_code == 201, f"Create cycle count failed: {cycle_count_create_resp.text}"
    cdata = cycle_count_create_resp.json()
    cycle_count = cdata.get("cycleCount")
    line_count = cdata.get("lineCount")
    assert cycle_count and line_count == 2, "CycleCount creation data invalid"
    cycle_count_id = cycle_count["id"]
    delay()

    try:
        # Step 5: GET /api/cycle-counts/:id -> verify returns cycle count detail with lines showing systemQty for each item.
        cycle_count_detail_resp = session.get(f"{BASE_URL}/cycle-counts/{cycle_count_id}", headers=headers, timeout=TIMEOUT)
        assert cycle_count_detail_resp.status_code == 200, f"Get cycle count detail failed: {cycle_count_detail_resp.text}"
        detail_json = cycle_count_detail_resp.json()
        cycle_count_detail = detail_json.get("cycleCount")
        lines = cycle_count_detail.get("lines", [])
        assert len(lines) == 2, "CycleCount detail lines count mismatch"
        # Extract lineIds and systemQty for each line corresponding to item1_id and item2_id
        line_map = {}
        for line in lines:
            if line.get("itemId") == item1_id:
                line_map["line1_id"] = line["lineId"] if "lineId" in line else line["id"] if "id" in line else None
                line_map["systemQty1"] = line.get("systemQty")
            elif line.get("itemId") == item2_id:
                line_map["line2_id"] = line["lineId"] if "lineId" in line else line["id"] if "id" in line else None
                line_map["systemQty2"] = line.get("systemQty")
        assert all(v is not None for v in line_map.values()), "Missing lineId or systemQty for lines"
        delay()

        # Step 6: PUT /api/cycle-counts/:id/lines with countedQty adjusted per instructions
        put_body = {
            "lines": [
                {"lineId": line_map["line1_id"], "countedQty": line_map["systemQty1"] + 3},
                {"lineId": line_map["line2_id"], "countedQty": line_map["systemQty2"] - 1}
            ]
        }
        put_lines_resp = session.put(f"{BASE_URL}/cycle-counts/{cycle_count_id}/lines", json=put_body, headers=headers, timeout=TIMEOUT)
        assert put_lines_resp.status_code == 200, f"Update cycle count lines failed: {put_lines_resp.text}"
        put_data = put_lines_resp.json()
        lines_updated = put_data.get("linesUpdated", 0)
        assert lines_updated == 2, f"Expected 2 lines updated but got {lines_updated}"
        delay()

        # Step 7: GET /api/cycle-counts/:id -> verify status is COMPLETED and lines show variance
        post_update_detail_resp = session.get(f"{BASE_URL}/cycle-counts/{cycle_count_id}", headers=headers, timeout=TIMEOUT)
        assert post_update_detail_resp.status_code == 200, f"Get cycle count detail after update failed: {post_update_detail_resp.text}"
        post_update_detail = post_update_detail_resp.json().get("cycleCount")
        status = post_update_detail.get("status")
        assert status == "COMPLETED", f"Expected status COMPLETED but got {status}"
        # Check variance present (countedQty - systemQty)
        updated_lines = post_update_detail.get("lines", [])
        variance_found = 0
        for line in updated_lines:
            countedQty = line.get("countedQty")
            systemQty = line.get("systemQty")
            variance = countedQty - systemQty if countedQty is not None and systemQty is not None else 0
            if variance != 0:
                variance_found += 1
        assert variance_found == 2, f"Expected variance on both lines but got {variance_found}"
        delay()

        # Step 8: POST /api/cycle-counts/:id/post -> verify 200 with adjustmentsCreated (2)
        post_adjust_resp = session.post(f"{BASE_URL}/cycle-counts/{cycle_count_id}/post", headers=headers, timeout=TIMEOUT)
        assert post_adjust_resp.status_code == 200, f"Post cycle count adjustments failed: {post_adjust_resp.text}"
        post_adjust_data = post_adjust_resp.json()
        adjustments_created = post_adjust_data.get("adjustmentsCreated")
        assert adjustments_created == 2, f"Expected 2 adjustments created but got {adjustments_created}"
        delay()

        # Step 9: GET /api/cycle-counts/:id -> verify status is POSTED
        final_detail_resp = session.get(f"{BASE_URL}/cycle-counts/{cycle_count_id}", headers=headers, timeout=TIMEOUT)
        assert final_detail_resp.status_code == 200, f"Get cycle count detail after post failed: {final_detail_resp.text}"
        final_status = final_detail_resp.json().get("cycleCount", {}).get("status")
        assert final_status == "POSTED", f"Expected status POSTED but got {final_status}"
        delay()

        # Step 10: GET /api/transactions/stock-position -> verify stock adjusted by variance amounts
        final_stock_resp = session.get(f"{BASE_URL}/transactions/stock-position", headers=headers, timeout=TIMEOUT)
        assert final_stock_resp.status_code == 200, f"Get stock position after post failed: {final_stock_resp.text}"
        final_positions = final_stock_resp.json().get("positions", [])
        final_adel_qty_map = {}
        for pos in final_positions:
            if "item" in pos and pos["item"]["id"] in [item1_id, item2_id]:
                final_adel_qty_map[pos["item"]["id"]] = pos.get("adelQty", 0)
        assert item1_id in final_adel_qty_map and item2_id in final_adel_qty_map, "Missing final adelQty for items"

        expected_adel_qty_1 = adel_qty_1 + 3
        expected_adel_qty_2 = adel_qty_2 - 1
        actual_adel_qty_1 = final_adel_qty_map[item1_id]
        actual_adel_qty_2 = final_adel_qty_map[item2_id]

        assert actual_adel_qty_1 == expected_adel_qty_1, f"Item1 adelQty expected {expected_adel_qty_1} got {actual_adel_qty_1}"
        assert actual_adel_qty_2 == expected_adel_qty_2, f"Item2 adelQty expected {expected_adel_qty_2} got {actual_adel_qty_2}"

    finally:
        # Cleanup: VOID the cycle count to maintain test environment hygiene
        # The test instructions say admin-only for void. Already logged in as admin.
        void_resp = session.post(f"{BASE_URL}/cycle-counts/{cycle_count_id}/void", headers=headers, timeout=TIMEOUT)
        if void_resp.status_code == 200:
            void_status = void_resp.json().get("status")
            assert void_status == "VOID", f"Expected VOID status after voiding cycle count, got {void_status}"
        else:
            # If cannot void, just pass (test environment limitation)
            pass


test_workflow_cycle_count_create_count_post_adjustments()