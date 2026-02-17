import requests

BASE_URL = "http://localhost:3000"
LOGIN_ENDPOINT = "/api/auth/login"
TIMEOUT = 30

def test_post_api_auth_login_returns_jwt_token_and_user_on_valid_credentials():
    url = BASE_URL + LOGIN_ENDPOINT
    payload = {
        "username": "jose",
        "password": "password123"
    }
    headers = {
        "Content-Type": "application/json"
    }
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=TIMEOUT)
        response.raise_for_status()
    except requests.RequestException as e:
        assert False, f"Request to {LOGIN_ENDPOINT} failed: {e}"

    assert response.status_code == 200, f"Expected status 200, got {response.status_code}"

    json_data = response.json()
    assert "token" in json_data, "Response JSON missing 'token'"
    token = json_data["token"]
    assert isinstance(token, str) and token.strip(), "'token' should be a non-empty string"

    assert "user" in json_data, "Response JSON missing 'user'"
    user = json_data["user"]
    assert isinstance(user, dict), "'user' should be a JSON object"

    # Check required user fields
    required_fields = ["id", "username", "fullName", "role"]
    for field in required_fields:
        assert field in user, f"'user' object missing field '{field}'"

    assert isinstance(user["id"], int), "'user.id' should be an integer"
    assert isinstance(user["username"], str) and user["username"].strip(), "'user.username' should be a non-empty string"
    assert isinstance(user["fullName"], str) and user["fullName"].strip(), "'user.fullName' should be a non-empty string"
    assert isinstance(user["role"], str) and user["role"].strip(), "'user.role' should be a non-empty string"

test_post_api_auth_login_returns_jwt_token_and_user_on_valid_credentials()