import requests

BASE_URL = "http://localhost:3000"
ADMIN_USERNAME = "jose"
ADMIN_PASSWORD = "Password1"
TIMEOUT = 30

def test_post_api_auth_change_password_with_valid_current_and_strong_new_password():
    # Step 1: Authenticate to get the JWT token
    login_url = f"{BASE_URL}/api/auth/login"
    login_payload = {
        "username": ADMIN_USERNAME,
        "password": ADMIN_PASSWORD
    }
    try:
        login_resp = requests.post(login_url, json=login_payload, timeout=TIMEOUT)
        login_resp.raise_for_status()
    except requests.exceptions.RequestException as e:
        assert False, f"Login request failed: {e}"

    login_json = login_resp.json()
    assert "token" in login_json and isinstance(login_json["token"], str), "Login response missing token"
    token = login_json["token"]

    headers = {
        "Authorization": f"Bearer {token}"
    }

    # Step 2: Test the POST /api/auth/change-password with valid current password and strong new password
    change_password_url = f"{BASE_URL}/api/auth/change-password"
    # Use a valid strong new password (not equal to current) - meets policy 8+ chars, 1 uppercase, 1 lowercase, 1 number
    new_password = "NewPassw0rd1"

    change_password_payload = {
        "currentPassword": ADMIN_PASSWORD,
        "newPassword": new_password
    }

    try:
        change_pass_resp = requests.post(change_password_url, json=change_password_payload, headers=headers, timeout=TIMEOUT)
        change_pass_resp.raise_for_status()
    except requests.exceptions.HTTPError as e:
        assert False, f"Change password request failed with HTTP error: {e}"
    except requests.exceptions.RequestException as e:
        assert False, f"Change password request failed: {e}"

    assert change_pass_resp.status_code == 200, f"Expected status 200, got {change_pass_resp.status_code}"
    resp_json = change_pass_resp.json()
    assert "message" in resp_json, "Response missing success message"
    assert resp_json["message"].lower() == "password changed successfully", f"Unexpected success message: {resp_json['message']}"

    # Step 3: Revert password back to original to keep test environment consistent
    revert_payload = {
        "currentPassword": new_password,
        "newPassword": ADMIN_PASSWORD
    }
    try:
        revert_resp = requests.post(change_password_url, json=revert_payload, headers=headers, timeout=TIMEOUT)
        revert_resp.raise_for_status()
    except requests.exceptions.RequestException as e:
        assert False, f"Failed to revert password after test: {e}"

    revert_json = revert_resp.json()
    assert revert_resp.status_code == 200, f"Expected status 200 on revert, got {revert_resp.status_code}"
    assert "message" in revert_json, "Revert response missing success message"
    assert revert_json["message"].lower() == "password changed successfully", f"Unexpected revert message: {revert_json['message']}"

test_post_api_auth_change_password_with_valid_current_and_strong_new_password()
