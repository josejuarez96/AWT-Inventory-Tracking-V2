import requests

BASE_URL = "http://localhost:3000"
ADMIN_USERNAME = "jose"
ADMIN_PASSWORD = "Password1"
TIMEOUT = 30


def test_post_api_auth_login_with_valid_credentials_returns_jwt_and_user():
    login_url = f"{BASE_URL}/api/auth/login"
    login_payload = {
        "username": ADMIN_USERNAME,
        "password": ADMIN_PASSWORD
    }
    headers = {"Content-Type": "application/json"}

    try:
        response = requests.post(login_url, json=login_payload, headers=headers, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Request failed: {e}"

    assert response.status_code == 200, f"Expected status code 200, got {response.status_code}"

    try:
        data = response.json()
    except ValueError:
        assert False, "Response is not valid JSON"

    assert "token" in data, "Response JSON missing 'token'"
    assert isinstance(data["token"], str)
    assert data["token"], "'token' is empty"

    assert "user" in data, "Response JSON missing 'user' object"
    user = data["user"]
    required_user_fields = ["id", "username", "fullName", "role"]
    for field in required_user_fields:
        assert field in user, f"'user' object missing field '{field}'"
    assert isinstance(user["id"], int), "'id' field in 'user' is not int"
    assert isinstance(user["username"], str) and user["username"], "'username' field in 'user' is empty or not a string"
    assert isinstance(user["fullName"], str) and user["fullName"], "'fullName' field in 'user' is empty or not a string"
    assert isinstance(user["role"], str) and user["role"], "'role' field in 'user' is empty or not a string"


test_post_api_auth_login_with_valid_credentials_returns_jwt_and_user()