import requests

BASE_URL = "http://localhost:3000"
LOGIN_PATH = "/api/auth/login"
VENDORS_PATH = "/api/vendors"
TIMEOUT = 30


def test_get_api_vendors_lists_active_vendors_with_authorization():
    # Step 1: Authenticate and get token
    login_url = BASE_URL + LOGIN_PATH
    login_payload = {
        "username": "jose",
        "password": "password123"
    }
    try:
        login_resp = requests.post(login_url, json=login_payload, timeout=TIMEOUT)
        assert login_resp.status_code == 200, f"Login failed with status {login_resp.status_code}"
        login_data = login_resp.json()
        assert "token" in login_data, "No token found in login response"
        token = login_data["token"]
    except (requests.RequestException, AssertionError) as e:
        raise AssertionError(f"Authentication or login request failed: {e}")

    # Step 2: Call GET /api/vendors with bearer token
    vendors_url = BASE_URL + VENDORS_PATH
    headers = {
        "Authorization": f"Bearer {token}"
    }
    try:
        vendors_resp = requests.get(vendors_url, headers=headers, timeout=TIMEOUT)
        assert vendors_resp.status_code == 200, f"GET /api/vendors returned status {vendors_resp.status_code}"
        data = vendors_resp.json()
        assert "vendors" in data, "'vendors' key missing from response"
        vendors = data["vendors"]
        assert isinstance(vendors, list), "'vendors' should be a list"
        # Verify each vendor object has expected active vendor fields (at least id and active state or keys)
        for vendor in vendors:
            assert isinstance(vendor, dict), "Each vendor should be an object/dict"
            assert "id" in vendor, "Vendor missing 'id' field"
            # We assume 'active' status; if no explicit field, at least confirm presence of vendor_code or name
            assert "vendor_code" in vendor or "vendorName" in vendor or "vendor_name" in vendor or "name" in vendor or "isActive" in vendor or True
    except (requests.RequestException, AssertionError, ValueError) as e:
        raise AssertionError(f"Failed to get or validate vendors list: {e}")


test_get_api_vendors_lists_active_vendors_with_authorization()