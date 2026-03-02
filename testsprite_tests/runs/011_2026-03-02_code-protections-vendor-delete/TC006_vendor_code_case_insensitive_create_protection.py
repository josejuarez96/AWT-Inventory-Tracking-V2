import requests

BASE_URL = "http://localhost:3000"
LOGIN_ADMIN = {"username": "jose", "password": "Password1"}
LOGIN_STANDARD = {"username": "alix", "password": "Password1"}
TIMEOUT = 30

def get_token(user_credentials):
    resp = requests.post(f"{BASE_URL}/api/auth/login", json=user_credentials, timeout=TIMEOUT)
    resp.raise_for_status()
    return resp.json()["token"]

def test_vendor_code_case_insensitive_create_protection():
    admin_token = get_token(LOGIN_ADMIN)
    headers_admin = {"Authorization": f"Bearer {admin_token}"}
    vendor_code_lower = "test-case-vnd"
    vendor_code_upper = "TEST-CASE-VND"
    vendor_code_mixed = "Test-Case-Vnd"

    new_vendor_id = None
    try:
        # 1. POST /api/vendors with vendorCode lowercase -> expect 201 and vendorCode normalized to uppercase
        create_resp = requests.post(
            f"{BASE_URL}/api/vendors",
            json={"vendorCode": vendor_code_lower, "vendorName": "Test Vendor"},
            headers=headers_admin,
            timeout=TIMEOUT
        )
        assert create_resp.status_code == 201, f"Expected 201 Created, got {create_resp.status_code}"
        vendor = create_resp.json().get("vendor")
        assert vendor is not None, "Response missing 'vendor'"
        new_vendor_id = vendor.get("id")
        assert new_vendor_id is not None, "Created vendor missing id"
        assert vendor.get("vendorCode") == vendor_code_upper, f"vendorCode not normalized to uppercase, got {vendor.get('vendorCode')}"

        # 2. POST /api/vendors with vendorCode uppercase (duplicate) -> expect 409 Conflict
        dup_resp_upper = requests.post(
            f"{BASE_URL}/api/vendors",
            json={"vendorCode": vendor_code_upper, "vendorName": "Dup"},
            headers=headers_admin,
            timeout=TIMEOUT
        )
        assert dup_resp_upper.status_code == 409, f"Expected 409 Conflict, got {dup_resp_upper.status_code}"
        err_upper = dup_resp_upper.json().get("error", "")
        assert vendor_code_upper in err_upper, f"Error message does not mention duplicate code: {err_upper}"

        # 3. POST /api/vendors with vendorCode mixed case (duplicate) -> expect 409 Conflict
        dup_resp_mixed = requests.post(
            f"{BASE_URL}/api/vendors",
            json={"vendorCode": vendor_code_mixed, "vendorName": "Dup2"},
            headers=headers_admin,
            timeout=TIMEOUT
        )
        assert dup_resp_mixed.status_code == 409, f"Expected 409 Conflict, got {dup_resp_mixed.status_code}"
        err_mixed = dup_resp_mixed.json().get("error", "")
        assert vendor_code_upper in err_mixed, f"Error message does not mention duplicate code: {err_mixed}"

        # 4. POST /api/vendors without authentication -> expect 401 Unauthorized
        unauth_resp = requests.post(
            f"{BASE_URL}/api/vendors",
            json={"vendorCode": "UNAUTH-VND", "vendorName": "Unauthorized"},
            timeout=TIMEOUT
        )
        assert unauth_resp.status_code == 401, f"Expected 401 Unauthorized, got {unauth_resp.status_code}"
        err_unauth = unauth_resp.json().get("error", "").lower()
        assert ("unauthorized" in err_unauth) or ("no token" in err_unauth), f"Expected unauthorized or no token error message, got: {err_unauth}"

    finally:
        # Cleanup: delete the created vendor if exists (requires admin)
        if new_vendor_id is not None:
            requests.delete(
                f"{BASE_URL}/api/vendors/{new_vendor_id}",
                headers=headers_admin,
                timeout=TIMEOUT
            )

test_vendor_code_case_insensitive_create_protection()
