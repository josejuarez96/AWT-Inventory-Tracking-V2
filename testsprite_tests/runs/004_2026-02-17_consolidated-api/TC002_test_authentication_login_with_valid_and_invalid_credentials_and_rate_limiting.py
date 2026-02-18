import requests
import time

BASE_URL = "http://localhost:3000"
LOGIN_PATH = "/api/auth/login"
TIMEOUT = 30

def test_authentication_login_valid_invalid_rate_limit():
    session = requests.Session()
    login_url = BASE_URL + LOGIN_PATH

    # Valid credentials
    valid_payload = {"username": "jose", "password": "password123"}
    headers = {"Content-Type": "application/json"}

    # Test valid login
    resp_valid = session.post(login_url, json=valid_payload, headers=headers, timeout=TIMEOUT)
    assert resp_valid.status_code == 200, f"Expected 200 OK for valid login, got {resp_valid.status_code}"
    body_valid = resp_valid.json()
    assert "token" in body_valid and isinstance(body_valid["token"], str)
    assert "user" in body_valid and isinstance(body_valid["user"], dict)
    user = body_valid["user"]
    assert "id" in user and isinstance(user["id"], int)
    assert user.get("username") == "jose"
    assert "fullName" in user and isinstance(user["fullName"], str)
    assert "role" in user and isinstance(user["role"], str)

    # Test invalid login
    invalid_payload = {"username": "jose", "password": "wrongpassword"}
    resp_invalid = session.post(login_url, json=invalid_payload, headers=headers, timeout=TIMEOUT)
    assert resp_invalid.status_code == 401, f"Expected 401 Unauthorized for invalid login, got {resp_invalid.status_code}"

    # Test rate limiting: more than 10 requests per minute
    # We start with a fresh session to isolate
    session_rl = requests.Session()

    # Make 10 successful login requests quickly to exhaust rate limit
    for i in range(10):
        resp = session_rl.post(login_url, json=valid_payload, headers=headers, timeout=TIMEOUT)
        # Accept 200 only for valid login
        assert resp.status_code == 200, f"Unexpected status code {resp.status_code} before rate limit"

    # The 11th request should trigger rate limit 429
    resp_429 = session_rl.post(login_url, json=valid_payload, headers=headers, timeout=TIMEOUT)
    assert resp_429.status_code == 429, f"Expected 429 Too Many Requests after 10 attempts, got {resp_429.status_code}"

test_authentication_login_valid_invalid_rate_limit()
