import requests

BASE_URL = "http://localhost:3000"
TIMEOUT = 30

def test_auth_logout_with_valid_token_returns_acknowledgement():
    login_url = f"{BASE_URL}/api/auth/login"
    logout_url = f"{BASE_URL}/api/auth/logout"

    login_payload = {
        "username": "alix",
        "password": "Password1"
    }

    try:
        # Login to get valid token
        login_resp = requests.post(login_url, json=login_payload, timeout=TIMEOUT)
        assert login_resp.status_code == 200, f"Login failed with status {login_resp.status_code}"
        login_data = login_resp.json()
        token = login_data.get("token")
        assert token and isinstance(token, str), "Token not found or invalid in login response"

        headers = {
            "Authorization": f"Bearer {token}"
        }

        # Logout request with valid token
        logout_resp = requests.post(logout_url, headers=headers, timeout=TIMEOUT)
        assert logout_resp.status_code == 200, f"Logout failed with status {logout_resp.status_code}"

        logout_data = logout_resp.json()
        assert "message" in logout_data and isinstance(logout_data["message"], str), "Logout acknowledgement message missing or invalid"

    except requests.RequestException as e:
        assert False, f"RequestException occurred: {e}"

test_auth_logout_with_valid_token_returns_acknowledgement()
