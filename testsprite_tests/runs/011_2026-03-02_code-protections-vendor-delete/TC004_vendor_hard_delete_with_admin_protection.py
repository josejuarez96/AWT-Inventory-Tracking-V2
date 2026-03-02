import requests

BASE_URL = "http://localhost:3000"
TIMEOUT = 30

def test_tc004_vendor_hard_delete_with_admin_protection():
    # Auth: login as admin and standard user
    def login(username, password):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={"username": username, "password": password}, timeout=TIMEOUT)
        resp.raise_for_status()
        return resp.json()["token"]

    admin_token = login("jose", "Password1")
    user_token = login("alix", "Password1")

    headers_admin = {"Authorization": f"Bearer {admin_token}"}
    headers_user = {"Authorization": f"Bearer {user_token}"}

    # Discover all vendors
    resp_vendors = requests.get(f"{BASE_URL}/api/vendors", params={"all": "true"}, headers=headers_admin, timeout=TIMEOUT)
    resp_vendors.raise_for_status()
    vendors = resp_vendors.json().get("vendors", [])

    # Discover items to find defaultVendor references
    resp_items = requests.get(f"{BASE_URL}/api/items", params={"page": 1, "limit": 50, "all": "true"}, headers=headers_admin, timeout=TIMEOUT)
    resp_items.raise_for_status()
    items = resp_items.json().get("items", [])

    # Map vendor IDs referenced by items as defaultVendorId
    referenced_vendor_ids = set(item.get("defaultVendorId") for item in items if item.get("defaultVendorId") is not None)

    # Function to check if vendor is referenced: referencedVendorIds or known transactions inferred from database state:
    # But we only have items to check references via defaultVendorId,
    # since transactions cannot be discovered by API, use the rules and existing vendorCodes to find referenced vendors
    # According to DB state, vendors with ids 1,2,3,4,6 have references
    referenced_ids_known = {1,2,3,4,6}

    # Select one referenced vendor to test blocked deletion by references
    referenced_vendor_id = None
    for v in vendors:
        vid = v.get("id")
        if vid in referenced_ids_known or vid in referenced_vendor_ids:
            referenced_vendor_id = vid
            break
    assert referenced_vendor_id is not None, "No referenced vendor found for test"

    # Select a vendor with no references or create one (create at least one new vendor anyway)
    vendor_to_create = {"vendorCode": "DEL-TEST-001", "vendorName": "Delete Test"}

    created_vendor_id = None

    try:
        # Create fresh vendor for successful hard delete test
        resp_create = requests.post(f"{BASE_URL}/api/vendors", json=vendor_to_create, headers=headers_admin, timeout=TIMEOUT)
        resp_create.raise_for_status()
        vendor_created = resp_create.json().get("vendor")
        assert vendor_created is not None, "Vendor not created"
        created_vendor_id = vendor_created["id"]
        assert vendor_created["vendorCode"].upper() == vendor_to_create["vendorCode"]

        # 1) Successful deletion: DELETE /api/vendors/<created_id> with admin token
        resp_delete = requests.delete(f"{BASE_URL}/api/vendors/{created_vendor_id}", headers=headers_admin, timeout=TIMEOUT)
        assert resp_delete.status_code == 200, f"Unexpected status code {resp_delete.status_code} on successful delete"
        json_delete = resp_delete.json()
        expected_msg = f'Vendor "{vendor_to_create["vendorCode"]}" permanently deleted.'
        assert json_delete.get("message") == expected_msg

        # 2) Deletion blocked due to references: try deleting referenced vendor
        resp_delete_ref = requests.delete(f"{BASE_URL}/api/vendors/{referenced_vendor_id}", headers=headers_admin, timeout=TIMEOUT)
        assert resp_delete_ref.status_code == 400, f"Expected 400 when deleting referenced vendor, got {resp_delete_ref.status_code}"
        json_ref = resp_delete_ref.json()
        # error string contains 'references' as per PRD
        assert "error" in json_ref and "reference" in json_ref["error"].lower()

        # 3) Deletion of non-existing vendor: DELETE /api/vendors/99999
        resp_delete_404 = requests.delete(f"{BASE_URL}/api/vendors/99999", headers=headers_admin, timeout=TIMEOUT)
        assert resp_delete_404.status_code == 404, f"Expected 404 on delete non-existing vendor, got {resp_delete_404.status_code}"
        json_404 = resp_delete_404.json()
        assert json_404.get("error", "").lower() == "vendor not found"

        # 4) Deletion attempt by non-admin user: DELETE any vendor (use ref vendor id)
        resp_delete_403 = requests.delete(f"{BASE_URL}/api/vendors/{referenced_vendor_id}", headers=headers_user, timeout=TIMEOUT)
        assert resp_delete_403.status_code == 403, f"Expected 403 on delete by non-admin, got {resp_delete_403.status_code}"
        json_403 = resp_delete_403.json()
        assert json_403.get("error") == "Admin access required"

    finally:
        # Cleanup: if vendor was created and not deleted (e.g. exception)
        if created_vendor_id is not None:
            # Try delete with admin token, ignore errors
            try:
                requests.delete(f"{BASE_URL}/api/vendors/{created_vendor_id}", headers=headers_admin, timeout=TIMEOUT)
            except Exception:
                pass

test_tc004_vendor_hard_delete_with_admin_protection()