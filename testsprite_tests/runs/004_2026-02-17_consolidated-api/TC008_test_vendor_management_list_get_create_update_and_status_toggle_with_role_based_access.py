import requests
import uuid

BASE_URL = "http://localhost:3000"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
VENDORS_URL = f"{BASE_URL}/api/vendors"

def login(username: str, password: str, timeout=30) -> str:
    resp = requests.post(
        LOGIN_URL,
        json={"username": username, "password": password},
        timeout=timeout,
    )
    assert resp.status_code == 200, f"Login failed: {resp.status_code} {resp.text}"
    data = resp.json()
    token = data.get("token")
    assert token, "No token received after login"
    return token

def get_first_vendor_id(token: str, timeout=30):
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.get(VENDORS_URL, headers=headers, timeout=timeout)
    assert resp.status_code == 200, f"GET vendors failed: {resp.status_code} {resp.text}"
    data = resp.json()
    vendors = data.get("vendors", [])
    if not vendors:
        return None
    return vendors[0]["id"]

def create_vendor(token: str, vendor_data: dict, timeout=30) -> dict:
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.post(VENDORS_URL, json=vendor_data, headers=headers, timeout=timeout)
    assert resp.status_code == 201, f"Create vendor failed: {resp.status_code} {resp.text}"
    data = resp.json()
    vendor = data.get("vendor")
    assert vendor, "No vendor returned on create"
    return vendor

def update_vendor(token: str, vendor_id: int, vendor_data: dict, timeout=30) -> dict:
    url = f"{VENDORS_URL}/{vendor_id}"
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.put(url, json=vendor_data, headers=headers, timeout=timeout)
    assert resp.status_code == 200, f"Update vendor failed: {resp.status_code} {resp.text}"
    data = resp.json()
    vendor = data.get("vendor")
    assert vendor, "No vendor returned on update"
    return vendor

def toggle_vendor_status(token: str, vendor_id: int, is_active: bool, timeout=30) -> dict:
    url = f"{VENDORS_URL}/{vendor_id}/status"
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.patch(url, json={"isActive": is_active}, headers=headers, timeout=timeout)
    assert resp.status_code == 200, f"Toggle vendor status failed: {resp.status_code} {resp.text}"
    data = resp.json()
    vendor = data.get("vendor")
    assert vendor, "No vendor returned on status toggle"
    assert vendor.get("isActive") == is_active, "Vendor status did not change as expected"
    return vendor

def get_vendor(token: str, vendor_id: int, timeout=30) -> dict:
    url = f"{VENDORS_URL}/{vendor_id}"
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.get(url, headers=headers, timeout=timeout)
    assert resp.status_code == 200, f"Get single vendor failed: {resp.status_code} {resp.text}"
    data = resp.json()
    vendor = data.get("vendor")
    assert vendor, "No vendor returned on get single"
    return vendor

def get_vendor_invalid_id(token: str, invalid_id, expected_status, timeout=30):
    url = f"{VENDORS_URL}/{invalid_id}"
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.get(url, headers=headers, timeout=timeout)
    assert resp.status_code == expected_status, f"Expected status {expected_status} for invalid id got {resp.status_code}"
    return resp.json()

def create_vendor_duplicate_code(token: str, vendor_data: dict, timeout=30):
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.post(VENDORS_URL, json=vendor_data, headers=headers, timeout=timeout)
    assert resp.status_code == 409, f"Expected 409 conflict on duplicate vendorCode, got: {resp.status_code}"
    return resp.json()

def update_vendor_invalid_id(token: str, invalid_id, vendor_data: dict, expected_status=404, timeout=30):
    url = f"{VENDORS_URL}/{invalid_id}"
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.put(url, json=vendor_data, headers=headers, timeout=timeout)
    assert resp.status_code == expected_status, f"Expected {expected_status} on update invalid id, got {resp.status_code}"
    return resp.json()

def toggle_vendor_status_invalid_id(token: str, invalid_id, is_active: bool, expected_status=404, timeout=30):
    url = f"{VENDORS_URL}/{invalid_id}/status"
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.patch(url, json={"isActive": is_active}, headers=headers, timeout=timeout)
    assert resp.status_code == expected_status, f"Expected {expected_status} on status toggle invalid id, got {resp.status_code}"
    return resp.json()

def test_vendor_management_list_get_create_update_and_status_toggle():
    admin_username = "jose"
    admin_password = "password123"

    token = login(admin_username, admin_password)

    headers = {"Authorization": f"Bearer {token}"}
    # 1. List vendors (authenticated user)
    resp_list = requests.get(VENDORS_URL, headers=headers, timeout=30)
    assert resp_list.status_code == 200, f"List vendors failed: {resp_list.status_code} {resp_list.text}"
    list_data = resp_list.json()
    assert "vendors" in list_data and isinstance(list_data["vendors"], list), "Vendors list missing or invalid"

    # Get vendor id if any, else None
    existing_vendor_id = get_first_vendor_id(token)

    # 2. Get single vendor (authenticated user)
    if existing_vendor_id is not None:
        vendor_single = get_vendor(token, existing_vendor_id)
        assert vendor_single["id"] == existing_vendor_id, "Returned vendor id mismatch"

    # Admin Create Vendor
    vendor_code_unique = f"VEND-{uuid.uuid4().hex[:8]}"
    vendor_create_payload = {
        "vendorCode": vendor_code_unique,
        "vendorName": "Test Vendor " + vendor_code_unique,
        "contactPerson": "John Doe",
        "phone": "123-456-7890",
        "email": "testvendor@example.com",
        "paymentTerms": "Net 30",
        "notes": "Created during automated test"
    }

    created_vendor = None
    try:
        created_vendor = create_vendor(token, vendor_create_payload)
        assert created_vendor["vendorCode"] == vendor_code_unique, "VendorCode mismatch on create"
        vendor_id = created_vendor["id"]

        # 3. Duplicate vendorCode create triggers 409
        dup_resp = create_vendor_duplicate_code(token, vendor_create_payload)
        # Updated assertion: Check if response JSON has 'message' containing vendor code exists message
        assert isinstance(dup_resp, dict) and "message" in dup_resp and "vendor code already exists" in dup_resp["message"].lower(), "Expected duplication error message"

        # 4. Update vendor with new data
        updated_vendor_code = f"{vendor_code_unique}-UPD"
        update_payload = {
            "vendorCode": updated_vendor_code,
            "vendorName": "Updated Vendor Name",
            "contactPerson": "Jane Smith",
            "phone": "098-765-4321",
            "email": "updatedvendor@example.com",
            "paymentTerms": "Net 45",
            "notes": "Updated by automated test"
        }
        updated_vendor = update_vendor(token, vendor_id, update_payload)
        assert updated_vendor["vendorCode"] == updated_vendor_code, "VendorCode not updated"
        assert updated_vendor["vendorName"] == "Updated Vendor Name", "VendorName not updated"

        # 5. Update with invalid ID returns 404
        invalid_id = 9999999999
        update_vendor_invalid_id(token, invalid_id, update_payload, expected_status=404)

        # 6. Toggle vendor status inactive
        toggled_vendor = toggle_vendor_status(token, vendor_id, False)
        assert toggled_vendor["isActive"] is False, "Vendor should be inactive after toggle"

        # 7. Toggle vendor status active again
        toggled_vendor = toggle_vendor_status(token, vendor_id, True)
        assert toggled_vendor["isActive"] is True, "Vendor should be active after toggle"

        # 8. Toggle status invalid id returns 404
        toggle_vendor_status_invalid_id(token, invalid_id, False, expected_status=404)

        # 9. Get vendor with invalid id format (e.g. string) returns 400 or 404
        # Using string ID 'invalid-id'
        resp_invalid_format = requests.get(f"{VENDORS_URL}/invalid-id", headers=headers, timeout=30)
        assert resp_invalid_format.status_code in [400, 404], f"Expected 400 or 404 for invalid id format, got {resp_invalid_format.status_code}"

        # 10. Get vendor with non-existent ID returns 404
        resp_invalid = requests.get(f"{VENDORS_URL}/{invalid_id}", headers=headers, timeout=30)
        assert resp_invalid.status_code == 404, f"Expected 404 for non-existent vendor id, got {resp_invalid.status_code}"

    finally:
        # Cleanup: deactivate created vendor if exists (no delete endpoint)
        if created_vendor:
            try:
                toggle_vendor_status(token, created_vendor["id"], False)
            except Exception:
                pass

test_vendor_management_list_get_create_update_and_status_toggle()
