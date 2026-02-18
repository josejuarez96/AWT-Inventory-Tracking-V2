import requests

BASE_URL = "http://localhost:3000"
TIMEOUT = 30

def test_auth_me_returns_current_user_with_valid_token():
    login_url = f"{BASE_URL}/api/auth/login"
    me_url = f"{BASE_URL}/api/auth/me"
    credentials = {"username": "alix", "password": "Password1"}
    try:
        # Login to get token
        login_resp = requests.post(login_url, json=credentials, timeout=TIMEOUT)
        assert login_resp.status_code == 200, f"Login failed with status {login_resp.status_code}"
        login_data = login_resp.json()
        token = login_data.get("token")
        user = login_data.get("user")
        assert token and isinstance(token, str), "No token received"
        assert user and isinstance(user, dict), "No user object received"

        headers = {"Authorization": f"Bearer {token}"}
        # Call /api/auth/me to get current user profile
        me_resp = requests.get(me_url, headers=headers, timeout=TIMEOUT)
        assert me_resp.status_code == 200, f"/api/auth/me failed with status {me_resp.status_code}"
        me_data = me_resp.json()
        # Validate user profile matches login user
        fetched_user = me_data.get("user")
        assert fetched_user, "No user object in /api/auth/me response"
        assert fetched_user.get("id") == user.get("id"), "User ID mismatch"
        assert fetched_user.get("username") == user.get("username"), "Username mismatch"
        assert fetched_user.get("fullName") == user.get("fullName"), "Full name mismatch"
        assert fetched_user.get("role") == user.get("role"), "Role mismatch"
    except requests.RequestException as e:
        assert False, f"RequestException occurred: {e}"

test_auth_me_returns_current_user_with_valid_token()
