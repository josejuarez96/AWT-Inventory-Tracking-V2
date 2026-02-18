import requests

BASE_URL = "http://localhost:3000"
TIMEOUT = 30

def test_post_api_auth_logout_acknowledges_logout_with_valid_token():
    login_url = f"{BASE_URL}/api/auth/login"
    logout_url = f"{BASE_URL}/api/auth/logout"

    login_payload = {
        "username": "jose",
        "password": "password123"
    }

    try:
        # Login to get JWT token
        login_resp = requests.post(login_url, json=login_payload, timeout=TIMEOUT)
        assert login_resp.status_code == 200, f"Login failed with status {login_resp.status_code}"
        login_data = login_resp.json()
        assert "token" in login_data and isinstance(login_data["token"], str) and login_data["token"], "Token missing or invalid in login response"
        token = login_data["token"]

        headers = {
            "Authorization": f"Bearer {token}"
        }

        # POST /api/auth/logout with valid token
        logout_resp = requests.post(logout_url, headers=headers, timeout=TIMEOUT)
        assert logout_resp.status_code == 200, f"Logout failed with status {logout_resp.status_code}"
        logout_data = logout_resp.json()
        assert "message" in logout_data and isinstance(logout_data["message"], str) and logout_data["message"], "Logout acknowledgement message missing or invalid"
    except requests.RequestException as e:
        assert False, f"Request failed: {e}"

test_post_api_auth_logout_acknowledges_logout_with_valid_token()