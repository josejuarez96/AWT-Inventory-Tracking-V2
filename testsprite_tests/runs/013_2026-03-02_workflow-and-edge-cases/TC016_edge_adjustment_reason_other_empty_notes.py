import requests
import time

BASE_URL = "http://localhost:3002/api"
TIMEOUT = 30

def test_edge_adjustment_reason_other_empty_notes():
    session = requests.Session()

    # Step 1: Login as user (alix/Password1)
    login_payload = {"username": "alix", "password": "Password1"}
    login_resp = session.post(f"{BASE_URL}/auth/login", json=login_payload, timeout=TIMEOUT)
    assert login_resp.status_code == 200, f"Login failed with status {login_resp.status_code}"
    token = login_resp.json().get("token")
    assert token, "No token returned on login"
    headers = {"Authorization": f"Bearer {token}"}

    # Step 2: GET /api/items to get a valid itemId
    items_resp = session.get(f"{BASE_URL}/items", headers=headers, timeout=TIMEOUT)
    assert items_resp.status_code == 200, f"Get items failed with status {items_resp.status_code}"
    items = items_resp.json().get("items", [])
    assert items and isinstance(items, list), "No items found or invalid format"
    item_id = items[0].get("id")
    assert item_id, "First item has no id"

    time.sleep(2)  # Wait 2 seconds as per instructions

    adjustment_url = f"{BASE_URL}/transactions/adjustments"

    results = {}

    # Step 3: POST with reason 'Other' and no notes field
    payload_no_notes = {
        "itemId": item_id,
        "location": "ADEL",
        "quantity": 1,
        "reason": "Other"
        # notes field omitted intentionally
    }
    resp_no_notes = session.post(adjustment_url, json=payload_no_notes, headers=headers, timeout=TIMEOUT)
    results["no_notes_status"] = resp_no_notes.status_code
    # Document actual behavior by assertion that matches current known behavior:
    # It may be 201 if notes are not validated, or 400 if backend requires notes.
    # So just assert it is either 201 or 400
    assert resp_no_notes.status_code in (201, 400), (
        f"Unexpected status {resp_no_notes.status_code} for adjustment without notes"
    )

    time.sleep(2)

    # Step 4: POST with reason 'Other' and notes as empty string
    payload_empty_notes = {
        "itemId": item_id,
        "location": "ADEL",
        "quantity": 1,
        "reason": "Other",
        "notes": ""
    }
    resp_empty_notes = session.post(adjustment_url, json=payload_empty_notes, headers=headers, timeout=TIMEOUT)
    results["empty_notes_status"] = resp_empty_notes.status_code
    assert resp_empty_notes.status_code in (201, 400), (
        f"Unexpected status {resp_empty_notes.status_code} for adjustment with empty notes"
    )

    time.sleep(2)

    # Step 5: POST with reason 'Other' and valid notes
    payload_valid_notes = {
        "itemId": item_id,
        "location": "ADEL",
        "quantity": 1,
        "reason": "Other",
        "notes": "Valid explanation"
    }
    resp_valid_notes = session.post(adjustment_url, json=payload_valid_notes, headers=headers, timeout=TIMEOUT)
    results["valid_notes_status"] = resp_valid_notes.status_code
    assert resp_valid_notes.status_code == 201, (
        f"Expected 201 Created for valid notes but got {resp_valid_notes.status_code}"
    )

    # Print the documented results (per instructions)
    print("Test TC016 - edge_adjustment_reason_other_empty_notes results:")
    print(f"1) POST without notes field status: {results['no_notes_status']} "
          f"{'(AUDIT TRAIL GAP if 201, validation ok if 400)'}")
    print(f"2) POST with empty string notes status: {results['empty_notes_status']} "
          f"{'(AUDIT TRAIL GAP if 201, validation ok if 400)'}")
    print(f"3) POST with valid notes status: {results['valid_notes_status']} (Expected 201)")

test_edge_adjustment_reason_other_empty_notes()