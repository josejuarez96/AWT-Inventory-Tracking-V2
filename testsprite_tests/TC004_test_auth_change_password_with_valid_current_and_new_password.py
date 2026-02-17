import requests

BASE_URL = "http://localhost:3000"
TIMEOUT = 30

ADMIN_USERNAME = "jose"
ADMIN_PASSWORD = "Password1"

def login(username, password):
    url = f"{BASE_URL}/api/auth/login"
    payload = {"username": username, "password": password}
    resp = requests.post(url, json=payload, timeout=TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    return data.get("token")

def change_password(token, current_password, new_password):
    url = f"{BASE_URL}/api/auth/change-password"
    headers = {"Authorization": f"Bearer {token}"}
    payload = {"currentPassword": current_password, "newPassword": new_password}
    return requests.post(url, json=payload, headers=headers, timeout=TIMEOUT)

def test_auth_change_password_with_valid_current_and_new_password():
    # Login as admin user to get valid token
    token = login(ADMIN_USERNAME, ADMIN_PASSWORD)
    assert token and isinstance(token, str), "Failed to obtain valid token"

    # Test changing password with valid currentPassword and valid newPassword
    new_password = "NewPass123"  # meets strength: 8+, upper, lower, number
    resp = change_password(token, ADMIN_PASSWORD, new_password)
    assert resp.status_code == 200, f"Expected 200 for valid password change, got {resp.status_code}"
    resp_json = resp.json()
    assert resp_json.get("message") == "Password changed successfully", "Unexpected success message"

    # Try login with old password - should fail
    resp_old_login = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD},
        timeout=TIMEOUT
    )
    assert resp_old_login.status_code == 401, "Old password should not authenticate after password change"

    # Try login with new password - should succeed
    resp_new_login = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": ADMIN_USERNAME, "password": new_password},
        timeout=TIMEOUT
    )
    assert resp_new_login.status_code == 200, "New password should authenticate successfully"
    new_token = resp_new_login.json().get("token")
    assert new_token and isinstance(new_token, str), "Failed to obtain token after password change login"

    # Test changing password with invalid current password returns 401
    headers = {"Authorization": f"Bearer {new_token}"}
    incorrect_current_pwd = "WrongCurrent123"
    valid_new_pwd = "ValidPass123"
    resp_invalid_current = requests.post(
        f"{BASE_URL}/api/auth/change-password",
        json={"currentPassword": incorrect_current_pwd, "newPassword": valid_new_pwd},
        headers=headers,
        timeout=TIMEOUT
    )
    assert resp_invalid_current.status_code == 401, f"Expected 401 for invalid current password, got {resp_invalid_current.status_code}"
    assert "Current password is incorrect" in resp_invalid_current.text or resp_invalid_current.json().get("message") == "Current password is incorrect", \
        "Unexpected error message for invalid current password"

    # Cleanup: revert password back to original to not disrupt subsequent tests
    resp_revert = change_password(new_token, new_password, ADMIN_PASSWORD)
    assert resp_revert.status_code == 200, "Failed to revert password to original"

test_auth_change_password_with_valid_current_and_new_password()
