import requests

BASE_URL = "http://localhost:3000"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
ME_URL = f"{BASE_URL}/api/auth/me"
TIMEOUT = 30


def test_authentication_me_endpoint_with_valid_and_invalid_tokens():
    # Step 1: Login to get a valid token
    login_payload = {"username": "jose", "password": "password123"}
    try:
        login_response = requests.post(LOGIN_URL, json=login_payload, timeout=TIMEOUT)
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        login_data = login_response.json()
        assert "token" in login_data and "user" in login_data, "Login response missing required keys"
        token = login_data["token"]
    except requests.RequestException as e:
        assert False, f"Login request failed with exception: {e}"

    # Step 2: Call GET /api/auth/me with valid token and expect 200 with user info
    headers_valid = {"Authorization": f"Bearer {token}"}
    try:
        me_response_valid = requests.get(ME_URL, headers=headers_valid, timeout=TIMEOUT)
        assert me_response_valid.status_code == 200, f"Expected 200, got {me_response_valid.status_code}"
        me_data = me_response_valid.json()
        assert "user" in me_data, "Response missing 'user' key"
        user = me_data["user"]
        assert isinstance(user, dict), "'user' should be a dictionary"
        # Validate presence of fields in user
        for field in ("id", "username", "fullName", "role"):
            assert field in user, f"Missing user field '{field}'"
    except requests.RequestException as e:
        assert False, f"GET /api/auth/me with valid token failed: {e}"

    # Step 3: Call GET /api/auth/me with no token and expect 401
    try:
        me_response_no_token = requests.get(ME_URL, timeout=TIMEOUT)
        assert me_response_no_token.status_code == 401, f"Expected 401 for no token, got {me_response_no_token.status_code}"
    except requests.RequestException as e:
        assert False, f"GET /api/auth/me with no token request failed: {e}"

    # Step 4: Call GET /api/auth/me with invalid token and expect 401
    headers_invalid = {"Authorization": "Bearer invalid.token.value"}
    try:
        me_response_invalid = requests.get(ME_URL, headers=headers_invalid, timeout=TIMEOUT)
        assert me_response_invalid.status_code == 401, f"Expected 401 for invalid token, got {me_response_invalid.status_code}"
    except requests.RequestException as e:
        assert False, f"GET /api/auth/me with invalid token request failed: {e}"


test_authentication_me_endpoint_with_valid_and_invalid_tokens()