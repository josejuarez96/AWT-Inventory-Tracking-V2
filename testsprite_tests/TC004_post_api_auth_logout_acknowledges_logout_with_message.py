import requests

BASE_URL = "http://localhost:3000"
TIMEOUT = 30

def test_post_api_auth_logout_acknowledges_logout_with_message():
    login_url = f"{BASE_URL}/api/auth/login"
    logout_url = f"{BASE_URL}/api/auth/logout"

    # Step 1: Login to get JWT token
    login_payload = {"username": "jose", "password": "password123"}
    try:
        login_resp = requests.post(login_url, json=login_payload, timeout=TIMEOUT)
        assert login_resp.status_code == 200, f"Login failed with status {login_resp.status_code}"
        login_data = login_resp.json()
        token = login_data.get("token")
        assert isinstance(token, str) and token, "Token missing or invalid in login response"
    except Exception as ex:
        raise AssertionError(f"Exception during login: {ex}")

    headers = {"Authorization": f"Bearer {token}"}

    # Step 2: POST /api/auth/logout with Authorization header
    try:
        logout_resp = requests.post(logout_url, headers=headers, timeout=TIMEOUT)
    except Exception as ex:
        raise AssertionError(f"Exception during logout request: {ex}")

    # Step 3: Validate response status and message presence
    assert logout_resp.status_code == 200, f"Logout failed with status {logout_resp.status_code}"
    logout_data = logout_resp.json()
    assert "message" in logout_data, "Logout response missing 'message' field"
    assert isinstance(logout_data["message"], str) and logout_data["message"], "Logout message is empty or not a string"


test_post_api_auth_logout_acknowledges_logout_with_message()