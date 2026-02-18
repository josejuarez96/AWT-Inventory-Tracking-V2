import requests

BASE_URL = "http://localhost:3000"
AUTH_ME_URL = f"{BASE_URL}/api/auth/me"

REQUEST_TIMEOUT = 30

def test_get_api_auth_me_with_invalid_or_missing_token_returns_401():
    # Step 1: GET /api/auth/me without token - expect 401
    resp_no_token = requests.get(AUTH_ME_URL, timeout=REQUEST_TIMEOUT)
    assert resp_no_token.status_code == 401, f"Expected 401 for missing token, got {resp_no_token.status_code}"

    # Step 2: GET /api/auth/me with invalid token - expect 401
    headers_invalid_token = {"Authorization": "Bearer invalid.token.value"}
    resp_invalid_token = requests.get(AUTH_ME_URL, headers=headers_invalid_token, timeout=REQUEST_TIMEOUT)
    assert resp_invalid_token.status_code == 401, f"Expected 401 for invalid token, got {resp_invalid_token.status_code}"


test_get_api_auth_me_with_invalid_or_missing_token_returns_401()
