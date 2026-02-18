import requests

BASE_URL = "http://localhost:3000"
LOGIN_PATH = "/api/auth/login"
USERS_PATH = "/api/users"
TIMEOUT = 30

def test_get_api_users_lists_all_users_with_admin_authorization():
    login_url = BASE_URL + LOGIN_PATH
    users_url = BASE_URL + USERS_PATH
    # Step 1: Authenticate to get admin token
    login_payload = {"username": "jose", "password": "password123"}
    try:
        login_resp = requests.post(login_url, json=login_payload, timeout=TIMEOUT)
        assert login_resp.status_code == 200, f"Login failed with status {login_resp.status_code}"
        login_data = login_resp.json()
        token = login_data.get("token")
        assert token and isinstance(token, str), "Token missing or not a string in login response"
    except Exception as e:
        assert False, f"Authentication request failed: {e}"

    headers = {"Authorization": f"Bearer {token}"}
    # Step 2: Call GET /api/users with admin token
    try:
        resp = requests.get(users_url, headers=headers, timeout=TIMEOUT)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        assert "users" in data, "'users' key not in response JSON"
        users = data["users"]
        assert isinstance(users, list), f"'users' should be a list, got {type(users)}"
        # Check each user item does not contain password hash
        for user in users:
            assert "password" not in user, "Password hash should not be present in user object"
            assert isinstance(user.get("id"), (int, float)), "User id should be number"
            assert isinstance(user.get("username"), str), "User username should be string"
            assert isinstance(user.get("fullName"), str), "User fullName should be string"
            assert isinstance(user.get("role"), str), "User role should be string"
            assert isinstance(user.get("isActive"), bool), "User isActive should be boolean"
    except Exception as e:
        assert False, f"GET /api/users request failed: {e}"

test_get_api_users_lists_all_users_with_admin_authorization()