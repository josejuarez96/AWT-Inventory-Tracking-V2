import requests
import time

BASE_URL = "http://localhost:3002/api"
TIMEOUT = 30

def test_workflow_bom_create_activate_retire_duplicate():
    session = requests.Session()
    headers = {"Content-Type": "application/json"}

    # Step 1: Login as admin (jose/Password1)
    login_payload = {"username": "jose", "password": "Password1"}
    resp = session.post(f"{BASE_URL}/auth/login", json=login_payload, timeout=TIMEOUT, headers=headers)
    assert resp.status_code == 200, f"Login failed with {resp.status_code}"
    token = resp.json().get("token")
    assert token and isinstance(token, str), "No token received in login response"
    auth_headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    time.sleep(2)

    # Step 2: GET /api/items to get 3 different active itemIds (1 finishedGood, 2 component)
    resp = session.get(f"{BASE_URL}/items", headers=auth_headers, timeout=TIMEOUT)
    assert resp.status_code == 200, f"Get items failed with {resp.status_code}"
    items = resp.json().get("items", [])
    assert isinstance(items, list), "Items list missing or invalid"
    # Need at least 3 different active items
    assert len(items) >= 3, "Less than 3 active items available"

    fg_id = None
    comp_ids = []
    # Choose first as finishedGood, next two as components
    fg_id = items[0]["id"]
    comp_ids = [items[1]["id"], items[2]["id"]]
    # sanity checks
    assert fg_id != comp_ids[0] and fg_id != comp_ids[1] and comp_ids[0] != comp_ids[1], "Item IDs must be distinct"

    time.sleep(2)

    bom_id = None
    duplicate_bom_id = None

    try:
        # Step 3: POST /api/boms to create BOM in DRAFT with 2 lines
        bom_payload = {
            "bomCode": "WF-BOM-001",
            "name": "Workflow Test BOM",
            "finishedGoodId": fg_id,
            "lines": [
                {"itemId": comp_ids[0], "quantityPer": 2},
                {"itemId": comp_ids[1], "quantityPer": 1}
            ]
        }
        resp = session.post(f"{BASE_URL}/boms", json=bom_payload, headers=auth_headers, timeout=TIMEOUT)
        assert resp.status_code == 201, f"BOM creation failed with status {resp.status_code}"
        bom = resp.json().get("bom")
        assert bom is not None, "BOM not returned in response"
        assert bom.get("status") == "DRAFT", f"Expected BOM status DRAFT but got {bom.get('status')}"
        assert "lines" in bom and len(bom["lines"]) == 2, f"BOM lines count expected 2 but got {len(bom.get('lines', []))}"
        bom_id = bom.get("id")
        assert bom_id is not None, "Created BOM missing id"

        time.sleep(2)

        # Step 4: GET /api/boms/:id -> verify bom detail with lines
        resp = session.get(f"{BASE_URL}/boms/{bom_id}", headers=auth_headers, timeout=TIMEOUT)
        assert resp.status_code == 200, f"BOM detail GET failed with {resp.status_code}"
        bom_detail = resp.json().get("bom")
        assert bom_detail is not None, "BOM detail missing"
        assert bom_detail.get("id") == bom_id, "BOM detail id mismatch"
        assert "lines" in bom_detail and len(bom_detail["lines"]) == 2, "BOM detail lines missing or count incorrect"
        # Verify lines contain item info and quantityPer
        for line in bom_detail["lines"]:
            assert "item" in line and "id" in line["item"], "Line missing item info"
            assert isinstance(line.get("quantityPer"), (int,float)) and line.get("quantityPer") > 0, "Invalid quantityPer in line"

        time.sleep(2)

        # Step 5: PUT /api/boms/:id with {name:'Updated Workflow BOM'} (only allowed in DRAFT)
        update_payload = {"name": "Updated Workflow BOM"}
        resp = session.put(f"{BASE_URL}/boms/{bom_id}", json=update_payload, headers=auth_headers, timeout=TIMEOUT)
        assert resp.status_code == 200, f"BOM update in DRAFT failed with {resp.status_code}"
        updated_bom = resp.json().get("bom")
        assert updated_bom is not None, "Updated BOM missing"
        assert updated_bom.get("name") == "Updated Workflow BOM", "BOM name not updated"

        time.sleep(2)

        # Step 6: PATCH /api/boms/:id/status with {status:'ACTIVE'}
        status_payload = {"status": "ACTIVE"}
        resp = session.patch(f"{BASE_URL}/boms/{bom_id}/status", json=status_payload, headers=auth_headers, timeout=TIMEOUT)
        assert resp.status_code == 200, f"BOM activation failed with status {resp.status_code}"
        resp_json = resp.json()
        assert resp_json.get("status") == "ACTIVE", f"BOM status expected ACTIVE but got {resp_json.get('status')}"

        time.sleep(2)

        # Step 7: PUT /api/boms/:id with {name:'Should Fail'} -> verify 400 Not in DRAFT status
        fail_update_payload = {"name": "Should Fail"}
        resp = session.put(f"{BASE_URL}/boms/{bom_id}", json=fail_update_payload, headers=auth_headers, timeout=TIMEOUT)
        assert resp.status_code == 400, f"BOM update outside DRAFT should fail with 400 but got {resp.status_code}"

        time.sleep(2)

        # Step 8: POST /api/boms/:id/duplicate -> verify 201 with cloned bomCode 'WF-BOM-001-COPY' and status DRAFT
        resp = session.post(f"{BASE_URL}/boms/{bom_id}/duplicate", headers=auth_headers, timeout=TIMEOUT)
        assert resp.status_code == 201, f"BOM duplicate failed with {resp.status_code}"
        clone = resp.json().get("bom")
        assert clone is not None, "Duplicated BOM missing"
        duplicate_bom_id = clone.get("id")
        assert duplicate_bom_id is not None, "Duplicated BOM id missing"
        assert clone.get("bomCode") == "WF-BOM-001-COPY" or clone.get("bomCode") == "WF-BOM-001-COPY" or clone.get("bomCode").endswith("-COPY"), "Duplicated BOM code incorrect"
        assert clone.get("status") == "DRAFT", f"Duplicated BOM status expected DRAFT but got {clone.get('status')}"

        time.sleep(2)

        # Step 9: PATCH /api/boms/:id/status with {status:'RETIRED'} (retire original bom)
        retire_payload = {"status": "RETIRED"}
        resp = session.patch(f"{BASE_URL}/boms/{bom_id}/status", json=retire_payload, headers=auth_headers, timeout=TIMEOUT)
        assert resp.status_code == 200, f"BOM retire failed with {resp.status_code}"
        resp_json = resp.json()
        assert resp_json.get("status") == "RETIRED", f"BOM status expected RETIRED but got {resp_json.get('status')}"

        time.sleep(2)

        # Step 10: GET /api/boms -> verify list shows the BOM with RETIRED status
        resp = session.get(f"{BASE_URL}/boms", headers=auth_headers, timeout=TIMEOUT)
        assert resp.status_code == 200, f"Get BOMs list failed with {resp.status_code}"
        boms_list = resp.json().get("boms", [])
        assert any(b for b in boms_list if b.get("id") == bom_id and b.get("status") == "RETIRED"), "Retired BOM not found in list"
    finally:
        # Clean up created BOMs (if any)
        # No DELETE endpoint - no cleanup possible for BOM
        # So no deletion here per instructions and known limitations
        pass

test_workflow_bom_create_activate_retire_duplicate()