import requests

BASE_URL = "http://localhost:3000"
LOGIN_ENDPOINT = "/api/auth/login"
TIMEOUT = 30


def test_post_api_auth_login_authenticates_user_and_returns_jwt_token():
    url = f"{BASE_URL}{LOGIN_ENDPOINT}"
    headers = {"Content-Type": "application/json"}

    # Test valid credentials
    valid_body = {"username": "jose", "password": "password123"}
    try:
        resp = requests.post(url, json=valid_body, headers=headers, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Request failed with exception: {e}"

    assert resp.status_code == 200, f"Expected 200 for valid login, got {resp.status_code}"
    try:
        data = resp.json()
    except ValueError:
        assert False, "Response is not valid JSON"

    assert "token" in data and isinstance(data["token"], str) and data["token"], "JWT token missing or invalid in response"
    assert "user" in data and isinstance(data["user"], dict), "User object missing or invalid in response"
    user = data["user"]
    assert all(k in user for k in ("id", "username", "fullName", "role")), "User object missing required fields"
    assert user["username"] == valid_body["username"], "Returned username does not match login username"
    assert isinstance(user["id"], int), "User id should be an integer"
    assert isinstance(user["fullName"], str), "User fullName should be a string"
    assert isinstance(user["role"], str), "User role should be a string"

    # Test invalid credentials
    invalid_body = {"username": "jose", "password": "wrongpassword"}
    try:
        resp_invalid = requests.post(url, json=invalid_body, headers=headers, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Request failed for invalid credentials with exception: {e}"

    assert resp_invalid.status_code == 401, f"Expected 401 for invalid login, got {resp_invalid.status_code}"


test_post_api_auth_login_authenticates_user_and_returns_jwt_token()