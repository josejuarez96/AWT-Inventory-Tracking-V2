import requests

BASE_URL = "http://localhost:3002"
TIMEOUT = 30

def test_post_api_auth_change_password_with_valid_current_and_strong_new_password():
    login_url = f"{BASE_URL}/api/auth/login"
    change_password_url = f"{BASE_URL}/api/auth/change-password"

    # Admin credentials as per instructions
    username = "jose"
    current_password = "Password1"
    new_password = "Str0ngPass"  # Meets policy: 8+ chars, uppercase, lowercase, number

    try:
        # 1. Login to get auth token
        login_resp = requests.post(
            login_url,
            json={"username": username, "password": current_password},
            timeout=TIMEOUT
        )
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        login_data = login_resp.json()
        token = login_data.get("token")
        assert token and isinstance(token, str), "Token not found in login response"

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

        # 2. Change password with valid current and strong new password
        change_pw_resp = requests.post(
            change_password_url,
            headers=headers,
            json={"currentPassword": current_password, "newPassword": new_password},
            timeout=TIMEOUT
        )
        assert change_pw_resp.status_code == 200, f"Change password failed: {change_pw_resp.text}"
        resp_json = change_pw_resp.json()
        message = resp_json.get("message")
        assert message == "Password changed successfully", f"Unexpected success message: {message}"

        # 3. Revert password back to original to avoid side effects on future tests
        revert_resp = requests.post(
            change_password_url,
            headers=headers,
            json={"currentPassword": new_password, "newPassword": current_password},
            timeout=TIMEOUT
        )
        assert revert_resp.status_code == 200, f"Reverting password failed: {revert_resp.text}"
        revert_json = revert_resp.json()
        revert_msg = revert_json.get("message")
        assert revert_msg == "Password changed successfully", f"Unexpected revert message: {revert_msg}"

    except requests.RequestException as e:
        assert False, f"Request failed: {str(e)}"

test_post_api_auth_change_password_with_valid_current_and_strong_new_password()