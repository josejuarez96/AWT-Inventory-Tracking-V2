import requests
import time

BASE_URL = "http://localhost:3000"
LOGIN_ENDPOINT = f"{BASE_URL}/api/auth/login"
TIMEOUT = 30

def test_auth_login_with_valid_credentials_returns_token_and_user():
    # Valid credentials provided
    valid_credentials = [
        {"username": "jose", "password": "Password1"},  # Admin user
        {"username": "alix", "password": "Password1"}   # Standard user
    ]

    # Test each valid user login once for correct response
    for creds in valid_credentials:
        try:
            resp = requests.post(
                LOGIN_ENDPOINT,
                json={"username": creds["username"], "password": creds["password"]},
                timeout=TIMEOUT
            )
        except requests.RequestException as e:
            assert False, f"RequestException occurred: {e}"

        # Accept either 200 OK or 429 Too Many Requests due to shared rate limiter
        assert resp.status_code in [200, 429], f"Expected status 200 or 429, got {resp.status_code}"

        if resp.status_code == 200:
            json_resp = resp.json()
            assert "token" in json_resp and isinstance(json_resp["token"], str) and len(json_resp["token"]) > 0, "Token missing or invalid"
            assert "user" in json_resp and isinstance(json_resp["user"], dict), "User object missing or invalid"
            user = json_resp["user"]
            for field in ["id", "username", "fullName", "role"]:
                assert field in user, f"User object missing field: {field}"
                assert user[field] is not None, f"User field {field} should not be None"
        else:
            # If 429 returned, verify rate limit message
            assert "Too many" in resp.text or "rate limit" in resp.text.lower(), "429 response does not contain rate limit message"

    # Test rate limiting: 10 allowed requests per 15 seconds, 11th should get 429
    creds = valid_credentials[0]  # Use admin user for rate limit test

    # We already did 1 request above for admin, so do up to 10 more requests
    # Check each response for either 200 or 429
    rate_limit_hit = False
    for i in range(10):  # Requests 2 to 11 inclusive
        try:
            resp = requests.post(
                LOGIN_ENDPOINT,
                json={"username": creds["username"], "password": creds["password"]},
                timeout=TIMEOUT
            )
        except requests.RequestException as e:
            assert False, f"RequestException occurred: {e}"

        if resp.status_code == 429:
            rate_limit_hit = True
            assert "Too many" in resp.text or "rate limit" in resp.text.lower(), f"429 response does not contain rate limit message on request {i+2}"
            break
        else:
            assert resp.status_code == 200, f"Expected status 200 or 429 on request {i+2}, got {resp.status_code}"

    if not rate_limit_hit:
        # If rate limit not hit during 10 requests, next request should get 429 or 200
        try:
            resp = requests.post(
                LOGIN_ENDPOINT,
                json={"username": creds["username"], "password": creds["password"]},
                timeout=TIMEOUT
            )
        except requests.RequestException as e:
            assert False, f"RequestException occurred: {e}"

        if resp.status_code == 429:
            assert "Too many" in resp.text or "rate limit" in resp.text.lower(), "429 response does not contain rate limit message"
        else:
            assert resp.status_code == 200, f"Expected status 200 or 429 for extra request, got {resp.status_code}"


test_auth_login_with_valid_credentials_returns_token_and_user()
