import requests
import datetime

BASE_URL = "http://localhost:3002"
LOGIN_ENDPOINT = f"{BASE_URL}/api/auth/login"
TIMEOUT = 30

def test_post_api_auth_login_with_valid_credentials_returns_token_and_user():
    # Valid credentials per instructions
    payload = {
        "username": "jose",
        "password": "Password1"
    }
    headers = {
        "Content-Type": "application/json"
    }
    try:
        response = requests.post(LOGIN_ENDPOINT, json=payload, headers=headers, timeout=TIMEOUT)
        # Assert status code 200
        assert response.status_code == 200, f"Expected status 200 but got {response.status_code}"

        data = response.json()

        # Assert token is present and is a non-empty string
        assert "token" in data, "Response missing 'token'"
        assert isinstance(data["token"], str) and len(data["token"]) > 0, "'token' should be a non-empty string"

        # Assert user object is present and has required fields
        assert "user" in data, "Response missing 'user' object"
        user = data["user"]
        required_user_fields = ["id", "username", "fullName", "role"]
        for field in required_user_fields:
            assert field in user, f"'user' object missing '{field}'"
        # Validate types and basic content
        assert isinstance(user["id"], int), "'user.id' should be int"
        assert isinstance(user["username"], str) and len(user["username"]) > 0, "'user.username' should be non-empty string"
        assert isinstance(user["fullName"], str) and len(user["fullName"]) > 0, "'user.fullName' should be non-empty string"
        assert isinstance(user["role"], str) and len(user["role"]) > 0, "'user.role' should be non-empty string"
    except requests.RequestException as e:
        assert False, f"Request failed: {e}"

test_post_api_auth_login_with_valid_credentials_returns_token_and_user()