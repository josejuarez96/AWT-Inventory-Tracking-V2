import requests
import time

BASE_URL = "http://localhost:3002/api"
LOGIN_URL = f"{BASE_URL}/auth/login"
ITEMS_URL = f"{BASE_URL}/items"
CYCLE_COUNTS_URL = f"{BASE_URL}/cycle-counts"

STANDARD_USER = {"username": "alix", "password": "Password1"}
TIMEOUT = 30
HEADERS = {"Content-Type": "application/json"}


def test_edge_standard_user_post_cycle_count_small_variance():
    session = requests.Session()
    try:
        # Step 1: Login as standard user (alix/Password1)
        resp = session.post(
            LOGIN_URL, json=STANDARD_USER, timeout=TIMEOUT, headers=HEADERS
        )
        assert resp.status_code == 200, f"Login failed: {resp.status_code} {resp.text}"
        token = resp.json().get("token")
        assert token, "No token returned on login"
        auth_headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

        # Step 2: GET /api/items to get a valid itemId
        resp = session.get(ITEMS_URL, headers=auth_headers, timeout=TIMEOUT)
        assert resp.status_code == 200, f"GET /api/items failed: {resp.status_code} {resp.text}"
        items = resp.json().get("items")
        assert items and isinstance(items, list) and len(items) > 0, "No items found"
        item_id = items[0].get("id")
        assert item_id is not None, "First item has no id"
        time.sleep(2)

        # Step 3: POST /api/cycle-counts with {location:'ADEL', itemSelection:'manual', itemIds:[itemId], blindCount:false} -> expect 201
        post_body = {
            "location": "ADEL",
            "itemSelection": "manual",
            "itemIds": [item_id],
            "blindCount": False
        }
        resp = session.post(CYCLE_COUNTS_URL, json=post_body, headers=auth_headers, timeout=TIMEOUT)
        assert resp.status_code == 201, f"POST /api/cycle-counts failed: {resp.status_code} {resp.text}"
        cycle_count_resp = resp.json()
        cycle_count = cycle_count_resp.get("cycleCount")
        assert cycle_count is not None, "Response missing cycleCount"
        cycle_count_id = cycle_count.get("id")
        assert cycle_count_id is not None, "cycleCount missing id"
        time.sleep(2)

        # Step 4: GET /api/cycle-counts/:id to get the line details and systemQty
        resp = session.get(f"{CYCLE_COUNTS_URL}/{cycle_count_id}", headers=auth_headers, timeout=TIMEOUT)
        assert resp.status_code == 200, f"GET /api/cycle-counts/{cycle_count_id} failed: {resp.status_code} {resp.text}"
        json_resp = resp.json()
        cycle_count_detail = json_resp.get("cycleCount")
        assert cycle_count_detail is not None, "Response missing cycleCount details"
        lines = cycle_count_detail.get("lines")
        assert lines and isinstance(lines, list) and len(lines) > 0, "No lines in cycle count detail"
        line = lines[0]
        line_id = line.get("id")
        system_qty = line.get("systemQty")
        assert line_id is not None, "Line missing id"
        assert isinstance(system_qty, (int, float)), "systemQty missing or invalid"
        time.sleep(2)

        # Step 5: PUT /api/cycle-counts/:id/lines with small variance countedQty = systemQty + 1
        put_body = {
            "lines": [
                {"lineId": line_id, "countedQty": system_qty + 1}
            ]
        }
        resp = session.put(
            f"{CYCLE_COUNTS_URL}/{cycle_count_id}/lines",
            json=put_body,
            headers=auth_headers,
            timeout=TIMEOUT,
        )
        assert resp.status_code == 200, f"PUT /api/cycle-counts/{cycle_count_id}/lines failed: {resp.status_code} {resp.text}"
        time.sleep(2)

        # Step 6: POST /api/cycle-counts/:id/post -> Record status code and response body
        resp = session.post(
            f"{CYCLE_COUNTS_URL}/{cycle_count_id}/post",
            headers=auth_headers,
            timeout=TIMEOUT,
        )
        # Status can be 200 or 403 based on permissions
        assert resp.status_code in (200, 403), f"POST /api/cycle-counts/{cycle_count_id}/post unexpected status: {resp.status_code}, body: {resp.text}"
        result = resp.json() if resp.status_code == 200 else resp.text
        # Document the response body including adjustmentsCreated field if present
        if resp.status_code == 200:
            adjustments_created = result.get("adjustmentsCreated")
            # adjustmentsCreated should be a number if present
            assert adjustments_created is None or isinstance(adjustments_created, int), f"Invalid adjustmentsCreated: {adjustments_created}"
        # No further assertion for 403: just document as finding

    finally:
        # Cleanup: Delete the created cycle count by voiding it if possible (only admin can void)
        # Since only admin can void and no delete endpoint, and the test is run as user, no cleanup possible here.
        # Just leave it or could log out if needed
        try:
            # Optionally logout the user
            session.post(f"{BASE_URL}/auth/logout", headers=auth_headers, timeout=TIMEOUT)
        except Exception:
            pass


test_edge_standard_user_post_cycle_count_small_variance()