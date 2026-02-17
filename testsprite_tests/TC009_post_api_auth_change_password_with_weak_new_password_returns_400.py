import requests
import time

BASE_URL = "http://localhost:3000"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
CHANGE_PASSWORD_URL = f"{BASE_URL}/api/auth/change-password"

ADMIN_USERNAME = "jose"
ADMIN_PASSWORD = "Password1"

MAX_LOGIN_RETRIES = 3
LOGIN_RETRY_DELAY = 15  # seconds


def login_with_retry(username, password):
    for attempt in range(MAX_LOGIN_RETRIES):
        resp = requests.post(
            LOGIN_URL,
            json={"username": username, "password": password},
            timeout=30
        )
        if resp.status_code == 429:
            if attempt < MAX_LOGIN_RETRIES - 1:
                time.sleep(LOGIN_RETRY_DELAY)
                continue
            else:
                resp.raise_for_status()
        else:
            return resp
    raise Exception("Login retry attempts exceeded")


def test_post_api_auth_change_password_weak_new_password_returns_400():
    # Login first to get token, with retry on 429
    login_resp = login_with_retry(ADMIN_USERNAME, ADMIN_PASSWORD)
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    login_data = login_resp.json()
    token = login_data.get("token")
    assert token, "Token missing in login response"

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    # Prepare payload with correct current password but weak new password
    payload = {
        "currentPassword": ADMIN_PASSWORD,
        "newPassword": "weak"  # deliberately weak (too short, no uppercase, no number)
    }

    resp = requests.post(
        CHANGE_PASSWORD_URL,
        json=payload,
        headers=headers,
        timeout=30
    )

    assert resp.status_code == 400, f"Expected 400, got {resp.status_code}, response: {resp.text}"
    # Validate response contains validation error message about weak password policy
    try:
        resp_json = resp.json()
    except Exception:
        resp_json = None

    assert resp_json is not None, "Response JSON expected but not received"
    error_msgs = []

    # If response has error messages in array or dict, gather them
    # The PRD only states 400 with Validation error or weak password message, so expect something indicative.
    if isinstance(resp_json, dict):
        # Include top-level 'error' field message if present
        if "error" in resp_json and isinstance(resp_json["error"], str):
            # Directly check this message for weak password indication
            assert "password" in resp_json["error"].lower() and ("weak" in resp_json["error"].lower() or "strength" in resp_json["error"].lower() or "8+" in resp_json["error"].lower()), \
                f"Validation error message about weak password not found in response: {resp.text}"
            return
        for k, v in resp_json.items():
            if isinstance(v, list):
                error_msgs.extend(v)
            elif isinstance(v, str) and k != "error":
                error_msgs.append(v)
        if not error_msgs and "message" in resp_json:
            error_msgs.append(resp_json["message"])

    elif isinstance(resp_json, list):
        error_msgs.extend(resp_json)

    # Check that at least one message mentions password strength / weak password
    assert any(
        "password" in msg.lower() and ("weak" in msg.lower() or "strength" in msg.lower() or "8+" in msg.lower())
        for msg in error_msgs
    ), f"Validation error message about weak password not found in response: {resp.text}"


test_post_api_auth_change_password_weak_new_password_returns_400()
