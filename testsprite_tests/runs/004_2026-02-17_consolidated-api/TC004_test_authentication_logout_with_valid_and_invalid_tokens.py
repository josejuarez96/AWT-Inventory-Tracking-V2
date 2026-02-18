import requests

BASE_URL = "http://localhost:3000"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
LOGOUT_URL = f"{BASE_URL}/api/auth/logout"

def test_authentication_logout_with_valid_and_invalid_tokens():
    session = requests.Session()
    try:
        # Step 1: Login with valid credentials to get a valid JWT token
        login_resp = session.post(
            LOGIN_URL,
            json={"username": "jose", "password": "password123"},
            timeout=30
        )
        assert login_resp.status_code == 200, f"Login failed with status {login_resp.status_code}"
        login_data = login_resp.json()
        assert "token" in login_data and isinstance(login_data["token"], str)
        token = login_data["token"]

        # Step 2: Logout with valid token
        logout_resp_valid = session.post(
            LOGOUT_URL,
            headers={"Authorization": f"Bearer {token}"},
            timeout=30
        )
        assert logout_resp_valid.status_code == 200, f"Logout with valid token failed with {logout_resp_valid.status_code}"
        logout_data = logout_resp_valid.json()
        assert "message" in logout_data and isinstance(logout_data["message"], str)

        # Step 3: Logout with no token
        logout_resp_no_token = session.post(LOGOUT_URL, timeout=30)
        assert logout_resp_no_token.status_code == 401, f"Logout with no token expected 401 but got {logout_resp_no_token.status_code}"

        # Step 4: Logout with invalid token
        invalid_token = "Bearer invalid.token.here"
        logout_resp_invalid = session.post(
            LOGOUT_URL,
            headers={"Authorization": invalid_token},
            timeout=30
        )
        assert logout_resp_invalid.status_code == 401, f"Logout with invalid token expected 401 but got {logout_resp_invalid.status_code}"

    finally:
        session.close()

test_authentication_logout_with_valid_and_invalid_tokens()