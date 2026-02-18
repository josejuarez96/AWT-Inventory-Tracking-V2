import requests

BASE_URL = "http://localhost:3000"
LOGIN_PATH = "/api/auth/login"
AUTH_ME_PATH = "/api/auth/me"
TIMEOUT = 30

def test_get_api_auth_me_returns_current_authenticated_user():
    login_url = BASE_URL + LOGIN_PATH
    auth_me_url = BASE_URL + AUTH_ME_PATH

    login_payload = {
        "username": "jose",
        "password": "password123"
    }
    try:
        # Authenticate and get token
        login_resp = requests.post(login_url, json=login_payload, timeout=TIMEOUT)
        assert login_resp.status_code == 200, f"Expected 200, got {login_resp.status_code}"
        login_data = login_resp.json()
        assert "token" in login_data, "Token not found in login response"
        token = login_data["token"]
        user = login_data["user"]
        assert isinstance(user, dict), "User data is not a dictionary"
        # Make authenticated request to /api/auth/me
        headers = {"Authorization": f"Bearer {token}"}
        auth_me_resp = requests.get(auth_me_url, headers=headers, timeout=TIMEOUT)
        assert auth_me_resp.status_code == 200, f"Expected 200, got {auth_me_resp.status_code}"
        auth_me_data = auth_me_resp.json()
        assert "user" in auth_me_data, "'user' key missing in auth_me response"
        auth_user = auth_me_data["user"]
        # Validate the user information matches login info
        assert isinstance(auth_user, dict), "User data in /api/auth/me response is not a dict"
        required_fields = ["id", "username", "fullName", "role"]
        for field in required_fields:
            assert field in auth_user, f"Field '{field}' missing in user data"
        assert auth_user["username"] == user["username"], "Usernames do not match"
        assert auth_user["id"] == user["id"], "User IDs do not match"
        assert auth_user["fullName"] == user["fullName"], "User fullNames do not match"
        assert auth_user["role"] == user["role"], "User roles do not match"
    except requests.RequestException as e:
        assert False, f"HTTP request failed: {e}"

test_get_api_auth_me_returns_current_authenticated_user()