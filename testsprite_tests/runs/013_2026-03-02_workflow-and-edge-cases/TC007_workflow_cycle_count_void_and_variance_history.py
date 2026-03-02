import requests
import time

BASE_URL = "http://localhost:3002/api"
TIMEOUT = 30

def test_workflow_cycle_count_void_and_variance_history():
    # Step 1: Login as admin
    login_url = f"{BASE_URL}/auth/login"
    login_payload = {"username": "jose", "password": "Password1"}
    r = requests.post(login_url, json=login_payload, timeout=TIMEOUT)
    assert r.status_code == 200, f"Login failed: {r.text}"
    token = r.json().get("token")
    assert token, "No token received on login"
    headers = {"Authorization": f"Bearer {token}"}
    time.sleep(2)

    # Step 2: GET /api/items to get an active itemId
    items_url = f"{BASE_URL}/items"
    r = requests.get(items_url, headers=headers, timeout=TIMEOUT)
    assert r.status_code == 200, f"Get items failed: {r.text}"
    items = r.json().get("items")
    assert items and isinstance(items, list), "Invalid items list"
    item_id = items[0].get("id")
    assert item_id is not None, "No item id found"
    time.sleep(2)

    cycle_count_id = None
    try:
        # Step 3: POST /api/cycle-counts with {location:'ADEL', itemSelection:'manual', itemIds:[itemId], blindCount:false}
        cycle_counts_url = f"{BASE_URL}/cycle-counts"
        cc_payload = {
            "location": "ADEL",
            "itemSelection": "manual",
            "itemIds": [item_id],
            "blindCount": False
        }
        r = requests.post(cycle_counts_url, json=cc_payload, headers=headers, timeout=TIMEOUT)
        assert r.status_code == 201, f"Create cycle count failed: {r.text}"
        json_data = r.json()
        cycle_count = json_data.get("cycleCount")
        assert cycle_count is not None, "No cycleCount returned"
        cycle_count_id = cycle_count.get("id")
        assert cycle_count_id is not None, "No cycleCount ID returned"
        time.sleep(2)

        # Step 4: POST /api/cycle-counts/:id/void -> verify 200 with status='VOID'
        void_url = f"{BASE_URL}/cycle-counts/{cycle_count_id}/void"
        r = requests.post(void_url, headers=headers, timeout=TIMEOUT)
        assert r.status_code == 200, f"Void cycle count failed: {r.text}"
        res = r.json()
        assert res.get("status") == "VOID", f"Expected status VOID after voiding, got {res.get('status')}"
        time.sleep(2)

        # Step 5: GET /api/cycle-counts/:id -> confirm status is VOID
        detail_url = f"{BASE_URL}/cycle-counts/{cycle_count_id}"
        r = requests.get(detail_url, headers=headers, timeout=TIMEOUT)
        assert r.status_code == 200, f"Get cycle count detail failed: {r.text}"
        detail = r.json().get("cycleCount")
        assert detail is not None, "No cycleCount detail found"
        assert detail.get("status") == "VOID", f"Status is not VOID after voiding, got {detail.get('status')}"
        time.sleep(2)

        # Step 6: GET /api/cycle-counts/variance-history -> verify 200 with lines[] and totals
        variance_history_url = f"{BASE_URL}/cycle-counts/variance-history"
        r = requests.get(variance_history_url, headers=headers, timeout=TIMEOUT)
        assert r.status_code == 200, f"Get variance history failed: {r.text}"
        variance_data = r.json()
        lines = variance_data.get("lines")
        totals = variance_data.get("totals")
        assert isinstance(lines, list), "Variance history lines is not a list"
        assert isinstance(totals, dict), "Variance history totals is not an object"
        time.sleep(2)

        # Step 7: GET /api/cycle-counts/variance-history/export -> verify 200 with CSV content-type
        variance_export_url = f"{BASE_URL}/cycle-counts/variance-history/export"
        r = requests.get(variance_export_url, headers=headers, timeout=TIMEOUT)
        assert r.status_code == 200, f"Variance export failed: {r.text}"
        content_type = r.headers.get("Content-Type", "")
        assert "csv" in content_type.lower(), f"Expected CSV content-type, got {content_type}"
        time.sleep(2)

        # Step 8: GET /api/cycle-counts?status=POSTED -> verify lists only posted counts
        posted_url = f"{BASE_URL}/cycle-counts"
        params = {"status": "POSTED"}
        r = requests.get(posted_url, headers=headers, params=params, timeout=TIMEOUT)
        assert r.status_code == 200, f"Get posted cycle counts failed: {r.text}"
        posted_counts = r.json().get("cycleCounts")
        assert isinstance(posted_counts, list), "cycleCounts not a list in posted counts response"
        # Confirm all returned cycle counts have status POSTED
        for cc in posted_counts:
            s = cc.get("status")
            assert s == "POSTED", f"Found cycle count with status {s} when filtering POSTED"
    finally:
        # Clean up: no delete API for cycle counts, so no deletion here.
        pass

test_workflow_cycle_count_void_and_variance_history()