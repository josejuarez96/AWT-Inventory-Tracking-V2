import time
import requests

BASE_URL = "http://localhost:3000"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
CHANGE_PASSWORD_URL = f"{BASE_URL}/api/auth/change-password"
TIMEOUT = 30
ADMIN_USERNAME = "jose"
ADMIN_PASSWORD = "Password1"
RETRY_WAIT_SECONDS = 15
MAX_LOGIN_ATTEMPTS = 5  # To avoid infinite loop in case of persistent rate limits

def test_post_api_auth_change_password_incorrect_current_password_returns_401():
    session = requests.Session()

    # Function to perform login with retry on 429
    def login_with_retry(username, password):
        attempts = 0
        while attempts < MAX_LOGIN_ATTEMPTS:
            response = session.post(
                LOGIN_URL,
                json={"username": username, "password": password},
                timeout=TIMEOUT
            )
            if response.status_code == 429:
                time.sleep(RETRY_WAIT_SECONDS)
                attempts += 1
                continue
            return response
        return None

    login_response = login_with_retry(ADMIN_USERNAME, ADMIN_PASSWORD)
    assert login_response is not None, "Failed to login due to repeated rate limiting"
    assert login_response.status_code == 200, f"Login failed with status {login_response.status_code}"
    login_json = login_response.json()
    token = login_json.get("token")
    assert token and isinstance(token, str), "Login response missing token"

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    # Attempt to change password with incorrect current password
    payload = {
        "currentPassword": "WrongCurrentPassword123",
        "newPassword": "NewPassword1"
    }

    change_response = session.post(
        CHANGE_PASSWORD_URL,
        headers=headers,
        json=payload,
        timeout=TIMEOUT
    )

    assert change_response.status_code == 401, f"Expected 401 Unauthorized, got {change_response.status_code}"
    try:
        resp_json = change_response.json()
        # If resp_json is dict with message key
        if isinstance(resp_json, dict):
            message = resp_json.get("message", "")
            assert "Current password is incorrect" in message, "Response message does not indicate incorrect current password"
        else:
            # If resp is string or other
            assert "Current password is incorrect" in str(resp_json), "Response message does not indicate incorrect current password"
    except Exception:
        # fallback to checking response text
        assert "Current password is incorrect" in change_response.text, "Response message does not indicate incorrect current password"

test_post_api_auth_change_password_incorrect_current_password_returns_401()
