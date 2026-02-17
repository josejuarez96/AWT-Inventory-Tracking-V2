import requests

BASE_URL = "http://localhost:3000"
LOGIN_ENDPOINT = f"{BASE_URL}/api/auth/login"
TIMEOUT = 30


def test_post_api_auth_login_with_valid_and_invalid_credentials():
    headers = {"Content-Type": "application/json"}

    # 1. Test valid credentials
    valid_payload = {
        "username": "jose",
        "password": "admin123"
    }
    try:
        resp = requests.post(LOGIN_ENDPOINT, json=valid_payload, headers=headers, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Request to login endpoint failed with exception: {e}"
    assert resp.status_code == 200, f"Expected 200 for valid credentials, got {resp.status_code}"
    data = resp.json()
    assert "token" in data and isinstance(data["token"], str) and data["token"], "Token missing or invalid in response"
    assert "user" in data and isinstance(data["user"], dict), "User info missing or invalid in response"
    user = data["user"]
    for field in ("id", "username", "fullName", "role"):
        assert field in user, f"Missing user field '{field}'"
    assert user["username"] == valid_payload["username"], "Returned username does not match login username"

    # 2. Test invalid credentials
    invalid_payload = {
        "username": "jose",
        "password": "wrongpassword"
    }
    try:
        resp = requests.post(LOGIN_ENDPOINT, json=invalid_payload, headers=headers, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Request to login endpoint failed with exception: {e}"
    assert resp.status_code == 401, f"Expected 401 for invalid credentials, got {resp.status_code}"

    # 3. Test malformed request bodies (missing fields)
    malformed_payloads = [
        {},  # Empty body
        {"username": "jose"},  # Missing password
        {"password": "admin123"},  # Missing username
        {"username": None, "password": "admin123"},  # Null username
        {"username": "jose", "password": None},  # Null password
        {"username": 1234, "password": "admin123"},  # Wrong type username
        {"username": "jose", "password": 1234},  # Wrong type password
    ]

    for malformed_payload in malformed_payloads:
        try:
            resp = requests.post(LOGIN_ENDPOINT, json=malformed_payload, headers=headers, timeout=TIMEOUT)
        except requests.RequestException as e:
            assert False, f"Request failed on malformed payload {malformed_payload} with exception: {e}"
        assert resp.status_code == 400, f"Expected 400 for malformed payload {malformed_payload}, got {resp.status_code}"
        try:
            error_data = resp.json()
            assert isinstance(error_data, list) or isinstance(error_data, dict), "Expected validation error array or object"
        except Exception:
            assert False, "Response for 400 did not contain JSON validation error array/object"


test_post_api_auth_login_with_valid_and_invalid_credentials()
