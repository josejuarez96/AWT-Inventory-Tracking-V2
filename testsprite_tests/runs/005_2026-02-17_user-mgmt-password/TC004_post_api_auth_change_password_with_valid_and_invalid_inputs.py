import requests

BASE_URL = "http://localhost:3000"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
CHANGE_PASSWORD_URL = f"{BASE_URL}/api/auth/change-password"

USERNAME = "jose"
ORIGINAL_PASSWORD = "password123"
NEW_VALID_PASSWORD = "Password1"
WEAK_PASSWORD = "short"
INCORRECT_CURRENT_PASSWORD = "WrongPass1"
TIMEOUT = 30


def test_change_password_valid_and_invalid():
    # Step 1: Login with original password
    login_payload = {"username": USERNAME, "password": ORIGINAL_PASSWORD}
    login_resp = requests.post(LOGIN_URL, json=login_payload, timeout=TIMEOUT)
    assert login_resp.status_code == 200, f"Login failed with status {login_resp.status_code}"
    token = login_resp.json().get("token")
    assert token, "No token returned on login"
    headers = {"Authorization": f"Bearer {token}"}

    # Step 2: Change password to valid strong password
    change_pw_payload = {"currentPassword": ORIGINAL_PASSWORD, "newPassword": NEW_VALID_PASSWORD}
    change_resp = requests.post(CHANGE_PASSWORD_URL, json=change_pw_payload, headers=headers, timeout=TIMEOUT)
    assert change_resp.status_code == 200, f"Valid password change failed with status {change_resp.status_code}"
    assert change_resp.json().get("message") == "Password changed successfully"

    # Step 3: Login again with the new password to get new token
    login_new_payload = {"username": USERNAME, "password": NEW_VALID_PASSWORD}
    login_new_resp = requests.post(LOGIN_URL, json=login_new_payload, timeout=TIMEOUT)
    assert login_new_resp.status_code == 200, f"Login with new password failed with status {login_new_resp.status_code}"
    new_token = login_new_resp.json().get("token")
    assert new_token, "No token returned after password change login"
    new_headers = {"Authorization": f"Bearer {new_token}"}

    # Step 4: Try changing password to a weak password (expect 400)
    weak_pw_payload = {"currentPassword": NEW_VALID_PASSWORD, "newPassword": WEAK_PASSWORD}
    weak_resp = requests.post(CHANGE_PASSWORD_URL, json=weak_pw_payload, headers=new_headers, timeout=TIMEOUT)
    assert weak_resp.status_code == 400, f"Weak password change did not fail as expected, status {weak_resp.status_code}"

    # Step 5: Try changing password with incorrect current password (expect 401)
    wrong_current_payload = {"currentPassword": INCORRECT_CURRENT_PASSWORD, "newPassword": NEW_VALID_PASSWORD}
    wrong_current_resp = requests.post(CHANGE_PASSWORD_URL, json=wrong_current_payload, headers=new_headers, timeout=TIMEOUT)
    assert wrong_current_resp.status_code == 401, f"Incorrect current password did not fail as expected, status {wrong_current_resp.status_code}"


test_change_password_valid_and_invalid()