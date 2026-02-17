import requests

BASE_URL = "http://localhost:3000"
TIMEOUT = 30


def test_authentication_me_returns_user_for_valid_token():
    # Step 1: Login with valid credentials to get token
    login_url = f"{BASE_URL}/api/auth/login"
    login_payload = {
        "username": "jose",
        "password": "password123"
    }
    login_resp = requests.post(login_url, json=login_payload, timeout=TIMEOUT)
    assert login_resp.status_code == 200, f"Login failed with status {login_resp.status_code}"
    login_data = login_resp.json()
    token = login_data.get("token")
    user_login = login_data.get("user")
    assert token and isinstance(token, str), "Token missing or invalid in login response"
    assert user_login and isinstance(user_login, dict), "User object missing or invalid in login response"
    for key in ("id", "username", "fullName", "role"):
        assert key in user_login, f"User object missing key '{key}'"

    # Step 2: Use token to call GET /api/auth/me
    me_url = f"{BASE_URL}/api/auth/me"
    headers = {"Authorization": f"Bearer {token}"}
    me_resp = requests.get(me_url, headers=headers, timeout=TIMEOUT)
    assert me_resp.status_code == 200, f"GET /api/auth/me failed with status {me_resp.status_code}"
    me_data = me_resp.json()
    user_me = me_data.get("user")
    assert user_me and isinstance(user_me, dict), "'user' missing or invalid in /api/auth/me response"
    for key in ("id", "username", "fullName", "role"):
        assert key in user_me, f"user object missing key '{key}' in /api/auth/me response"

    # Validate that the user data from /api/auth/me matches the login user data
    assert user_me["id"] == user_login["id"], "User ID mismatch between login and /api/auth/me"
    assert user_me["username"] == user_login["username"], "Username mismatch between login and /api/auth/me"
    assert user_me["fullName"] == user_login["fullName"], "FullName mismatch between login and /api/auth/me"
    assert user_me["role"] == user_login["role"], "Role mismatch between login and /api/auth/me"


test_authentication_me_returns_user_for_valid_token()