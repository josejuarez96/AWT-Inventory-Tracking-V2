import requests

BASE_URL = "http://localhost:3000"
ADMIN_USERNAME = "jose"
ADMIN_PASSWORD = "Password1"
TIMEOUT = 30

def test_get_api_auth_me_with_valid_token_returns_user_profile():
    login_url = f"{BASE_URL}/api/auth/login"
    auth_me_url = f"{BASE_URL}/api/auth/me"

    # Step 1: Login to get JWT token
    login_payload = {"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
    try:
        login_resp = requests.post(login_url, json=login_payload, timeout=TIMEOUT)
        assert login_resp.status_code == 200, f"Login failed with status {login_resp.status_code}"
        login_json = login_resp.json()
        assert "token" in login_json and isinstance(login_json["token"], str) and len(login_json["token"]) > 0, "Token missing or invalid in login response"
        assert "user" in login_json and isinstance(login_json["user"], dict), "User object missing or invalid in login response"
        token = login_json["token"]
    except Exception as e:
        assert False, f"Exception during login: {e}"

    # Step 2: Get /api/auth/me with valid token
    headers = {"Authorization": f"Bearer {token}"}
    try:
        me_resp = requests.get(auth_me_url, headers=headers, timeout=TIMEOUT)
        assert me_resp.status_code == 200, f"/api/auth/me failed with status {me_resp.status_code}"
        me_json = me_resp.json()
        assert "user" in me_json and isinstance(me_json["user"], dict), "'user' key missing or invalid in /api/auth/me response"
        user = me_json["user"]
        # Validate user fields
        for field in ["id", "username", "fullName", "role"]:
            assert field in user, f"'{field}' missing in user profile"
        assert isinstance(user["id"], int), "'id' in user profile is not an int"
        assert isinstance(user["username"], str) and len(user["username"]) > 0, "'username' in user profile invalid"
        assert isinstance(user["fullName"], str), "'fullName' in user profile invalid"
        assert isinstance(user["role"], str) and len(user["role"]) > 0, "'role' in user profile invalid"
    except Exception as e:
        assert False, f"Exception during GET /api/auth/me: {e}"

test_get_api_auth_me_with_valid_token_returns_user_profile()