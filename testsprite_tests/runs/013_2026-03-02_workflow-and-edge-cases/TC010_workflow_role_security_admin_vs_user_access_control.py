import requests
import time

BASE_URL = "http://localhost:3002/api"
TIMEOUT = 30

def login(username: str, password: str) -> str:
    """Login and return the Bearer token."""
    resp = requests.post(f"{BASE_URL}/auth/login",
                         json={"username": username, "password": password},
                         timeout=TIMEOUT)
    resp.raise_for_status()
    token = resp.json()["token"]
    return token


def test_workflow_role_security_admin_vs_user_access_control():
    # Step 1: Login as standard user (alix/Password1)
    user_token = login("alix", "Password1")
    user_headers = {"Authorization": f"Bearer {user_token}"}
    time.sleep(2)

    # Step 2: Verify user CANNOT access admin-only master data POST endpoints (expect 403)

    # POST /api/users with body {username:'testfail', password:'Password1', fullName:'Fail', role:'user'}
    resp = requests.post(f"{BASE_URL}/users",
                         headers=user_headers,
                         json={"username": "testfail", "password": "Password1", "fullName": "Fail", "role": "user"},
                         timeout=TIMEOUT)
    assert resp.status_code == 403, f"Expected 403 for POST /users as standard user, got {resp.status_code}"
    time.sleep(2)

    # POST /api/items with body {itemCode:'FAIL-001', description:'Fail', category:'Test', unitOfMeasure:'EA'}
    resp = requests.post(f"{BASE_URL}/items",
                         headers=user_headers,
                         json={"itemCode": "FAIL-001", "description": "Fail", "category": "Test", "unitOfMeasure": "EA"},
                         timeout=TIMEOUT)
    assert resp.status_code == 403, f"Expected 403 for POST /items as standard user, got {resp.status_code}"
    time.sleep(2)

    # POST /api/vendors with body {vendor_code:'FAIL-V', vendor_name:'Fail Vendor'}
    # Based on PRD vendor fields, it uses vendor_code and vendor_name as keys
    resp = requests.post(f"{BASE_URL}/vendors",
                         headers=user_headers,
                         json={"vendor_code": "FAIL-V", "vendor_name": "Fail Vendor"},
                         timeout=TIMEOUT)
    assert resp.status_code == 403, f"Expected 403 for POST /vendors as standard user, got {resp.status_code}"
    time.sleep(2)

    # POST /api/boms with body {bomCode:'FAIL-BOM', name:'Fail', finishedGoodId:1, lines:[]}
    resp = requests.post(f"{BASE_URL}/boms",
                         headers=user_headers,
                         json={"bomCode": "FAIL-BOM", "name": "Fail", "finishedGoodId": 1, "lines": []},
                         timeout=TIMEOUT)
    assert resp.status_code == 403, f"Expected 403 for POST /boms as standard user, got {resp.status_code}"
    time.sleep(2)

    # Step 3: Verify user CAN access read endpoints (expect 200)

    # GET /api/items
    resp = requests.get(f"{BASE_URL}/items", headers=user_headers, timeout=TIMEOUT)
    assert resp.status_code == 200, f"Expected 200 for GET /items as standard user, got {resp.status_code}"
    time.sleep(2)

    # GET /api/vendors
    resp = requests.get(f"{BASE_URL}/vendors", headers=user_headers, timeout=TIMEOUT)
    assert resp.status_code == 200, f"Expected 200 for GET /vendors as standard user, got {resp.status_code}"
    time.sleep(2)

    # GET /api/transactions/stock-position
    resp = requests.get(f"{BASE_URL}/transactions/stock-position", headers=user_headers, timeout=TIMEOUT)
    assert resp.status_code == 200, f"Expected 200 for GET /transactions/stock-position as standard user, got {resp.status_code}"
    time.sleep(2)

    # GET /api/dashboard/stats
    resp = requests.get(f"{BASE_URL}/dashboard/stats", headers=user_headers, timeout=TIMEOUT)
    assert resp.status_code == 200, f"Expected 200 for GET /dashboard/stats as standard user, got {resp.status_code}"
    time.sleep(2)

    # GET /api/cycle-counts
    resp = requests.get(f"{BASE_URL}/cycle-counts", headers=user_headers, timeout=TIMEOUT)
    assert resp.status_code == 200, f"Expected 200 for GET /cycle-counts as standard user, got {resp.status_code}"
    time.sleep(2)

    # GET /api/production
    resp = requests.get(f"{BASE_URL}/production", headers=user_headers, timeout=TIMEOUT)
    assert resp.status_code == 200, f"Expected 200 for GET /production as standard user, got {resp.status_code}"
    time.sleep(2)

    # Step 4: Verify user CAN perform operational tasks

    # GET /api/items to get a valid itemId
    resp = requests.get(f"{BASE_URL}/items", headers=user_headers, timeout=TIMEOUT)
    resp.raise_for_status()
    items = resp.json().get("items", [])
    assert items, "No items returned for standard user"
    item = items[0]
    item_id = item["id"]
    time.sleep(2)

    # GET /api/vendors to get a valid vendorId
    resp = requests.get(f"{BASE_URL}/vendors", headers=user_headers, timeout=TIMEOUT)
    resp.raise_for_status()
    vendors = resp.json().get("vendors", [])
    assert vendors, "No vendors returned for standard user"
    vendor = vendors[0]
    vendor_id = vendor["id"]
    time.sleep(2)

    # POST /api/transactions/receipts with payload -> expect 201
    receipt_payload = {
        "itemId": item_id,
        "vendorId": vendor_id,
        "location": "ADEL",
        "quantity": 1,
        "unitCost": 1.00,
        "transactionDate": "2026-02-19"
    }
    resp = requests.post(f"{BASE_URL}/transactions/receipts", headers=user_headers, json=receipt_payload, timeout=TIMEOUT)
    assert resp.status_code == 201, f"Expected 201 for POST /transactions/receipts by user, got {resp.status_code}"
    data = resp.json()
    tx = data.get("transaction")
    assert tx is not None, "Missing transaction object in receipt response"
    assert tx.get("item", {}).get("id") == item_id, "Receipt transaction itemId mismatch"
    assert tx.get("quantity") == 1, "Receipt transaction quantity mismatch"
    assert tx.get("location") == "ADEL", "Receipt transaction location mismatch"
    assert "lastPaidPrice" in data, "Missing lastPaidPrice in receipt response"
    time.sleep(2)

    # POST /api/transactions/adjustments with payload -> expect 201
    adjustment_payload = {
        "itemId": item_id,
        "location": "ADEL",
        "quantity": 1,
        "reason": "Correction"
    }
    resp = requests.post(f"{BASE_URL}/transactions/adjustments", headers=user_headers, json=adjustment_payload, timeout=TIMEOUT)
    assert resp.status_code == 201, f"Expected 201 for POST /transactions/adjustments by user, got {resp.status_code}"
    tx_adj = resp.json().get("transaction")
    assert tx_adj is not None, "Missing transaction object in adjustment response"
    time.sleep(2)

    # POST /api/cycle-counts with payload -> expect 201
    cycle_count_payload = {
        "location": "ADEL",
        "itemSelection": "manual",
        "itemIds": [item_id],
        "blindCount": False
    }
    resp = requests.post(f"{BASE_URL}/cycle-counts", headers=user_headers, json=cycle_count_payload, timeout=TIMEOUT)
    assert resp.status_code == 201, f"Expected 201 for POST /cycle-counts by user, got {resp.status_code}"
    resp_json = resp.json()
    assert "cycleCount" in resp_json, "Missing cycleCount object in response"
    time.sleep(2)

    # Step 5: Login as admin (jose/Password1)
    admin_token = login("jose", "Password1")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    time.sleep(2)

    # POST /api/users with valid body -> expect 201
    # Because user creation may conflict with existing users, use a unique username with timestamp.
    import datetime
    uname = f"testuser_{int(datetime.datetime.now().timestamp())}"
    new_user_payload = {
        "username": uname,
        "password": "Password1",
        "fullName": "Test Admin User",
        "role": "user"
    }
    resp = requests.post(f"{BASE_URL}/users", headers=admin_headers, json=new_user_payload, timeout=TIMEOUT)
    assert resp.status_code == 201, f"Expected 201 for POST /users by admin, got {resp.status_code}"
    created_user = resp.json().get("user")
    assert created_user is not None and created_user.get("username") == uname, "Created user info mismatch"
    time.sleep(2)

    # GET /api/users -> expect 200
    resp = requests.get(f"{BASE_URL}/users", headers=admin_headers, timeout=TIMEOUT)
    assert resp.status_code == 200, f"Expected 200 for GET /users by admin, got {resp.status_code}"
    users_list = resp.json().get("users")
    assert isinstance(users_list, list), "Users list missing or invalid"
    time.sleep(2)

    # POST /api/items with valid body -> expect 201
    # To avoid conflicts, create an itemCode with timestamp suffix
    item_code = f"ADMIN-ITEM-{int(datetime.datetime.now().timestamp())}"
    # For the new item creation we must supply required fields: itemCode, description, category, unitOfMeasure
    item_payload = {
        "itemCode": item_code,
        "description": "Admin created item",
        "category": "TestCategory",
        "unitOfMeasure": "EA"
    }
    # Also note minQuantity, maxQuantity, standardCost, defaultVendorId, notes are optional based on PRD

    # For defaultVendorId: get one valid vendorId for admin
    resp = requests.get(f"{BASE_URL}/vendors", headers=admin_headers, timeout=TIMEOUT)
    resp.raise_for_status()
    vendors_admin = resp.json().get("vendors", [])
    default_vendor_id = vendors_admin[0]["id"] if vendors_admin else None
    if default_vendor_id:
        item_payload["defaultVendorId"] = default_vendor_id

    resp = requests.post(f"{BASE_URL}/items", headers=admin_headers, json=item_payload, timeout=TIMEOUT)
    assert resp.status_code == 201, f"Expected 201 for POST /items by admin, got {resp.status_code}"
    created_item = resp.json().get("item")
    assert created_item is not None and created_item.get("itemCode") == item_code, "Created item info mismatch"

test_workflow_role_security_admin_vs_user_access_control()