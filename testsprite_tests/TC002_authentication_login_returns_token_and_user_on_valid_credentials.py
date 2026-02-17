import requests

BASE_URL = "http://localhost:3000"
TIMEOUT = 30

def test_authentication_login_returns_token_and_user_on_valid_credentials():
    url = f"{BASE_URL}/api/auth/login"
    payload = {
        "username": "jose",
        "password": "password123"
    }
    headers = {
        "Content-Type": "application/json"
    }
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Request failed: {e}"
    assert response.status_code == 200, f"Expected status code 200, got {response.status_code}"
    try:
        data = response.json()
    except ValueError:
        assert False, "Response is not in JSON format"
    assert "token" in data, "Response JSON missing 'token'"
    assert isinstance(data["token"], str) and len(data["token"]) > 0, "'token' should be a non-empty string"
    assert "user" in data, "Response JSON missing 'user'"
    user = data["user"]
    assert isinstance(user, dict), "'user' should be a dictionary"
    for key in ["id", "username", "fullName", "role"]:
        assert key in user, f"User object missing '{key}'"
    assert isinstance(user["id"], int), "'id' should be an integer"
    assert isinstance(user["username"], str) and len(user["username"]) > 0, "'username' should be a non-empty string"
    assert isinstance(user["fullName"], str) and len(user["fullName"]) > 0, "'fullName' should be a non-empty string"
    assert isinstance(user["role"], str) and len(user["role"]) > 0, "'role' should be a non-empty string"


test_authentication_login_returns_token_and_user_on_valid_credentials()