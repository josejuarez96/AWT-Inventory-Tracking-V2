import requests

BASE_URL = "http://localhost:3000"
TIMEOUT = 30

def test_vendor_next_code_suggestion():
    # Authenticate as standard user (alix)
    try:
        auth_resp = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "alix", "password": "Password1"},
            timeout=TIMEOUT
        )
        auth_resp.raise_for_status()
        token = auth_resp.json().get("token")
        assert token, "Authentication failed: no token returned"
        headers = {"Authorization": f"Bearer {token}"}
    except Exception as e:
        assert False, f"Authentication request failed: {e}"

    # Discover existing vendors to confirm existing codes (optional per instructions, must do anyway)
    try:
        vendors_resp = requests.get(f"{BASE_URL}/api/vendors?all=true", headers=headers, timeout=TIMEOUT)
        vendors_resp.raise_for_status()
        vendors = vendors_resp.json().get("vendors", [])
        # Confirm that vendorCode "V-001" exists, per database state given
        v001_exists = any(v.get("vendorCode") == "V-001" for v in vendors)
        assert v001_exists, "Required vendor code V-001 not found in vendors list"
    except Exception as e:
        assert False, f"Failed to get vendors list: {e}"

    # 1) Test prefix that has existing numeric suffixes: prefix=V-
    try:
        next_code_resp = requests.get(
            f"{BASE_URL}/api/vendors/next-code",
            headers=headers,
            params={"prefix": "V-"},
            timeout=TIMEOUT,
        )
        assert next_code_resp.status_code == 200, "Expected HTTP 200 for next code with prefix 'V-'"
        data = next_code_resp.json()
        next_code = data.get("nextCode")
        assert next_code == "V-002", f"Expected nextCode 'V-002', got '{next_code}'"
    except Exception as e:
        assert False, f"Failed to get next code for prefix 'V-': {e}"

    # 2) Test prefix with no existing codes: prefix=NEW-
    try:
        next_code_resp = requests.get(
            f"{BASE_URL}/api/vendors/next-code",
            headers=headers,
            params={"prefix": "NEW-"},
            timeout=TIMEOUT,
        )
        assert next_code_resp.status_code == 200, "Expected HTTP 200 for next code with prefix 'NEW-'"
        data = next_code_resp.json()
        next_code = data.get("nextCode")
        assert next_code == "NEW-001", f"Expected nextCode 'NEW-001', got '{next_code}'"
    except Exception as e:
        assert False, f"Failed to get next code for prefix 'NEW-': {e}"

    # 3) Test error response when prefix query parameter is missing
    try:
        error_resp = requests.get(
            f"{BASE_URL}/api/vendors/next-code",
            headers=headers,
            timeout=TIMEOUT,
        )
        assert error_resp.status_code == 400, f"Expected HTTP 400 when prefix param is missing, got {error_resp.status_code}"
        error_data = error_resp.json()
        assert error_data.get("error") == "prefix query parameter is required", f"Unexpected error message: {error_data.get('error')}"
    except Exception as e:
        assert False, f"Failed to get error response when prefix is missing: {e}"

test_vendor_next_code_suggestion()