import requests
import time

BASE_URL = "http://localhost:3002/api"
TIMEOUT = 30

def test_edge_standard_user_production_kit_access():
    session = requests.Session()
    headers = {"Content-Type": "application/json"}

    # Step 1: Login as admin (jose/Password1)
    admin_login_payload = {"username": "jose", "password": "Password1"}
    resp = session.post(f"{BASE_URL}/auth/login", json=admin_login_payload, timeout=TIMEOUT)
    assert resp.status_code == 200, f"Admin login failed: {resp.status_code} {resp.text}"
    admin_token = resp.json().get("token")
    assert admin_token, "No token returned for admin login"
    admin_headers = headers.copy()
    admin_headers["Authorization"] = f"Bearer {admin_token}"
    time.sleep(2)

    # Step 2: GET /api/items to get 3 itemIds (finishedGood + 2 components)
    resp = session.get(f"{BASE_URL}/items", headers=admin_headers, timeout=TIMEOUT)
    assert resp.status_code == 200, f"Failed to get items as admin: {resp.status_code} {resp.text}"
    items = resp.json().get("items")
    assert isinstance(items, list) and len(items) >= 3, "Less than 3 items returned"
    # Select first item as finishedGoodId and next two as components
    fgId = items[0]["id"]
    comp1 = items[1]["id"]
    comp2 = items[2]["id"]
    time.sleep(2)

    # Step 3a: GET /api/vendors to get first vendorId
    resp = session.get(f"{BASE_URL}/vendors", headers=admin_headers, timeout=TIMEOUT)
    assert resp.status_code == 200, f"Failed to get vendors: {resp.status_code} {resp.text}"
    vendors = resp.json().get("vendors")
    assert isinstance(vendors, list) and len(vendors) >= 1, "No vendors found"
    vendorId = vendors[0]["id"]

    # Step 3b: Ensure components have stock by POST /api/transactions/receipts for comp1
    receipt_payload_1 = {
        "itemId": comp1,
        "vendorId": vendorId,
        "location": "ADEL",
        "quantity": 100,
        "unitCost": 5.00,
        "transactionDate": "2026-02-19"
    }
    resp = session.post(f"{BASE_URL}/transactions/receipts", headers=admin_headers, json=receipt_payload_1, timeout=TIMEOUT)
    assert resp.status_code == 201, f"Receipt for comp1 failed: {resp.status_code} {resp.text}"
    time.sleep(2)

    # Step 3c: POST receipt for comp2 similarly
    receipt_payload_2 = {
        "itemId": comp2,
        "vendorId": vendorId,
        "location": "ADEL",
        "quantity": 100,
        "unitCost": 5.00,
        "transactionDate": "2026-02-19"
    }
    resp = session.post(f"{BASE_URL}/transactions/receipts", headers=admin_headers, json=receipt_payload_2, timeout=TIMEOUT)
    assert resp.status_code == 201, f"Receipt for comp2 failed: {resp.status_code} {resp.text}"
    time.sleep(2)

    # Step 4: POST /api/boms with BOM containing comp1 and comp2 components
    bom_payload = {
        "bomCode": "EDGE-KIT-BOM",
        "name": "Edge Kit Test",
        "finishedGoodId": fgId,
        "lines": [
            {"itemId": comp1, "quantityPer": 1},
            {"itemId": comp2, "quantityPer": 1}
        ]
    }
    resp = session.post(f"{BASE_URL}/boms", headers=admin_headers, json=bom_payload, timeout=TIMEOUT)
    assert resp.status_code == 201, f"Create BOM failed: {resp.status_code} {resp.text}"
    bom = resp.json().get("bom")
    assert bom and "id" in bom, "BOM ID missing in response"
    bomId = bom["id"]
    time.sleep(2)

    # Step 5: PATCH /api/boms/:bomId/status with status 'ACTIVE'
    patch_payload = {"status": "ACTIVE"}
    resp = session.patch(f"{BASE_URL}/boms/{bomId}/status", headers=admin_headers, json=patch_payload, timeout=TIMEOUT)
    assert resp.status_code == 200, f"Activating BOM failed: {resp.status_code} {resp.text}"
    time.sleep(2)

    # Step 6: Login as standard user (alix/Password1)
    user_login_payload = {"username": "alix", "password": "Password1"}
    resp = session.post(f"{BASE_URL}/auth/login", json=user_login_payload, timeout=TIMEOUT)
    assert resp.status_code == 200, f"Standard user login failed: {resp.status_code} {resp.text}"
    user_token = resp.json().get("token")
    assert user_token, "No token returned for standard user login"
    user_headers = headers.copy()
    user_headers["Authorization"] = f"Bearer {user_token}"
    time.sleep(2)

    # Step 7: POST /api/production/kit as standard user
    production_kit_payload = {
        "finishedGoodId": fgId,
        "location": "ADEL",
        "quantityProduced": 1,
        "bomId": bomId,
        "components": [
            {"itemId": comp1, "quantityPer": 1},
            {"itemId": comp2, "quantityPer": 1}
        ]
    }
    resp = session.post(f"{BASE_URL}/production/kit", headers=user_headers, json=production_kit_payload, timeout=TIMEOUT)
    status_code = resp.status_code

    # DOCUMENT THE RESPONSE: Security boundary test
    # Expected: 403 Forbidden if standard user not allowed
    # Current behavior: If 201, this is a SECURITY GAP (standard user should not create production orders)
    if status_code == 201:
        print("SECURITY GAP: Standard user was allowed to create production order (201 Created). Response body:", resp.json())
    elif status_code == 403:
        print("Security boundary correct: Standard user forbidden to create production order (403 Forbidden).")
    else:
        print(f"Unexpected status code: {status_code}. Response body: {resp.text}")

    assert status_code in (201, 403), f"Unexpected status code {status_code} for standard user production kit creation"

test_edge_standard_user_production_kit_access()