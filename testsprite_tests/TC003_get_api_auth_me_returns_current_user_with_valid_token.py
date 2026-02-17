import requests

BASE_URL = "http://localhost:3000"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
AUTH_ME_URL = f"{BASE_URL}/api/auth/me"
TIMEOUT = 30

def test_get_api_auth_me_returns_current_user_with_valid_token():
    # Step 1: Login to get JWT token
    login_payload = {
        "username": "jose",
        "password": "password123"
    }
    try:
        login_resp = requests.post(LOGIN_URL, json=login_payload, timeout=TIMEOUT)
        assert login_resp.status_code == 200, f"Login failed with status {login_resp.status_code}"
        login_data = login_resp.json()
        token = login_data.get("token")
        user = login_data.get("user")
        assert token is not None and isinstance(token, str), "Token not found or invalid in login response"
        assert user is not None and isinstance(user, dict), "User object not found or invalid in login response"
    except requests.RequestException as e:
        assert False, f"Exception during login request: {e}"

    # Step 2: Use token to call GET /api/auth/me
    headers = {
        "Authorization": f"Bearer {token}"
    }
    try:
        auth_me_resp = requests.get(AUTH_ME_URL, headers=headers, timeout=TIMEOUT)
        assert auth_me_resp.status_code == 200, f"GET /api/auth/me failed with status {auth_me_resp.status_code}"
        auth_me_data = auth_me_resp.json()
        assert "user" in auth_me_data, "'user' key not in response JSON"
        user_obj = auth_me_data["user"]
        # Validate user object fields
        for field in ("id", "username", "fullName", "role"):
            assert field in user_obj, f"Field '{field}' missing in user object"
        # Check that user in /auth/me matches the login user info in username, id, fullName, role
        assert user_obj["id"] == user["id"], "User 'id' mismatch between login and auth/me"
        assert user_obj["username"] == user["username"], "User 'username' mismatch between login and auth/me"
        assert user_obj["fullName"] == user["fullName"], "User 'fullName' mismatch between login and auth/me"
        assert user_obj["role"] == user["role"], "User 'role' mismatch between login and auth/me"
    except requests.RequestException as e:
        assert False, f"Exception during GET /api/auth/me request: {e}"

test_get_api_auth_me_returns_current_user_with_valid_token()