import requests

BASE_URL = "http://localhost:3000"
TIMEOUT = 30

def test_authentication_logout_acknowledges_logout_with_message():
    login_url = f"{BASE_URL}/api/auth/login"
    logout_url = f"{BASE_URL}/api/auth/logout"

    # Step 1: Login as standard user to get a valid token
    login_payload = {
        "username": "alix",
        "password": "password123"
    }
    try:
        login_resp = requests.post(login_url, json=login_payload, timeout=TIMEOUT)
        assert login_resp.status_code == 200, f"Expected 200 on login, got {login_resp.status_code}"
        login_data = login_resp.json()
        token = login_data.get("token")
        user = login_data.get("user")
        assert token and isinstance(token, str), "Token missing or not a string"
        assert user and isinstance(user, dict), "User missing or not a dict"
    except requests.RequestException as e:
        assert False, f"Login request failed with exception: {e}"

    headers = {
        "Authorization": f"Bearer {token}"
    }

    # Step 2: POST /api/auth/logout with valid Authorization header
    try:
        logout_resp = requests.post(logout_url, headers=headers, timeout=TIMEOUT)
        assert logout_resp.status_code == 200, f"Expected 200 on logout, got {logout_resp.status_code}"
        logout_data = logout_resp.json()
        message = logout_data.get("message")
        assert message and isinstance(message, str), "Logout confirmation message missing or not a string"
    except requests.RequestException as e:
        assert False, f"Logout request failed with exception: {e}"

test_authentication_logout_acknowledges_logout_with_message()