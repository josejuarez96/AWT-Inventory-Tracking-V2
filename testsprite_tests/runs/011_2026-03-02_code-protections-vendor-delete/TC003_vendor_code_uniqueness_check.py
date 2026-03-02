import requests

BASE_URL = "http://localhost:3000"
TIMEOUT = 30

def test_vendor_code_uniqueness_check():
    # Authenticate as standard user (authorization required)
    auth_resp = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": "alix", "password": "Password1"},
        timeout=TIMEOUT
    )
    assert auth_resp.status_code == 200, f"Auth failed: {auth_resp.text}"
    token = auth_resp.json().get("token")
    assert token, "No token in auth response"
    headers = {"Authorization": f"Bearer {token}"}

    # Discover existing vendors
    vendors_resp = requests.get(f"{BASE_URL}/api/vendors?all=true", headers=headers, timeout=TIMEOUT)
    assert vendors_resp.status_code == 200, f"Vendor discovery failed: {vendors_resp.text}"
    vendors = vendors_resp.json().get("vendors")
    assert isinstance(vendors, list) and len(vendors) > 0, "No vendors found"

    # Pick one existing vendor to test
    existing_vendor = vendors[0]
    existing_code_upper = existing_vendor["vendorCode"].upper()
    existing_code_lower = existing_code_upper.lower()
    existing_id = existing_vendor["id"]

    # 1) Check with exact uppercase code
    check_upper_resp = requests.get(
        f"{BASE_URL}/api/vendors/check-code",
        headers=headers,
        params={"code": existing_code_upper},
        timeout=TIMEOUT
    )
    assert check_upper_resp.status_code == 200, f"Check uppercase failed: {check_upper_resp.text}"
    check_upper_json = check_upper_resp.json()
    assert check_upper_json.get("exists") is True, "Expected exists:true for uppercase code"
    assert check_upper_json.get("id") == existing_id, "Returned id mismatch for uppercase code"

    # 2) Check with lowercase code (should be case-insensitive)
    check_lower_resp = requests.get(
        f"{BASE_URL}/api/vendors/check-code",
        headers=headers,
        params={"code": existing_code_lower},
        timeout=TIMEOUT
    )
    assert check_lower_resp.status_code == 200, f"Check lowercase failed: {check_lower_resp.text}"
    check_lower_json = check_lower_resp.json()
    assert check_lower_json.get("exists") is True, "Expected exists:true for lowercase code"
    assert check_lower_json.get("id") == existing_id, "Returned id mismatch for lowercase code"

    # 3) Check with non-existing code
    non_existing_code = "ZZZZZ-NONEXISTENT"
    check_nonexist_resp = requests.get(
        f"{BASE_URL}/api/vendors/check-code",
        headers=headers,
        params={"code": non_existing_code},
        timeout=TIMEOUT
    )
    assert check_nonexist_resp.status_code == 200, f"Check non-existing code failed: {check_nonexist_resp.text}"
    check_nonexist_json = check_nonexist_resp.json()
    assert check_nonexist_json.get("exists") is False, "Expected exists:false for non-existing code"
    assert check_nonexist_json.get("id") is None, "Expected id:null for non-existing code"

    # 4) Check without code query parameter --> should get 400 error
    check_no_param_resp = requests.get(
        f"{BASE_URL}/api/vendors/check-code",
        headers=headers,
        timeout=TIMEOUT
    )
    assert check_no_param_resp.status_code == 400, f"Expected 400 for missing code param, got {check_no_param_resp.status_code}"
    check_no_param_json = check_no_param_resp.json()
    assert "error" in check_no_param_json and "code query parameter is required" in check_no_param_json["error"].lower()

test_vendor_code_uniqueness_check()