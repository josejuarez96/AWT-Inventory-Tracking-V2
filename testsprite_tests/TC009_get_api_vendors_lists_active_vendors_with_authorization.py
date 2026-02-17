import requests

BASE_URL = "http://localhost:3000"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
VENDORS_URL = f"{BASE_URL}/api/vendors"
TIMEOUT = 30


def test_get_api_vendors_lists_active_vendors_with_authorization():
    # Step 1: Authenticate to get JWT token
    login_payload = {"username": "jose", "password": "password123"}
    try:
        login_resp = requests.post(LOGIN_URL, json=login_payload, timeout=TIMEOUT)
        assert login_resp.status_code == 200, f"Login failed with status code {login_resp.status_code}"
        login_data = login_resp.json()
        assert "token" in login_data, "No token in login response"
        token = login_data["token"]
    except requests.RequestException as e:
        assert False, f"Login request failed: {e}"

    headers = {"Authorization": f"Bearer {token}"}

    # Step 2: GET /api/vendors with Authorization header
    try:
        vendors_resp = requests.get(VENDORS_URL, headers=headers, timeout=TIMEOUT)
        assert vendors_resp.status_code == 200, f"Expected 200 OK, got {vendors_resp.status_code}"
        vendors_data = vendors_resp.json()
        assert "vendors" in vendors_data, "Response JSON missing 'vendors' key"
        vendors = vendors_data["vendors"]
        assert isinstance(vendors, list), "'vendors' is not a list"
    except requests.RequestException as e:
        assert False, f"GET /api/vendors request failed: {e}"


test_get_api_vendors_lists_active_vendors_with_authorization()