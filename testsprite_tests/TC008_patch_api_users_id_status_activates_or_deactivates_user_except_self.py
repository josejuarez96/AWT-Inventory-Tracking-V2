import requests
import uuid

BASE_URL = "http://localhost:3000"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
USERS_URL = f"{BASE_URL}/api/users"

ADMIN_USERNAME = "jose"
ADMIN_PASSWORD = "admin123"

TIMEOUT = 30


def test_patch_api_users_id_status_activate_deactivate_except_self():
    # Authenticate as admin
    login_resp = requests.post(
        LOGIN_URL,
        json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD},
        timeout=TIMEOUT,
    )
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    login_data = login_resp.json()
    token = login_data.get("token")
    assert token and isinstance(token, str), "Missing or invalid token in login response"
    admin_user = login_data.get("user")
    assert admin_user and isinstance(admin_user, dict), "Missing admin user info"
    admin_id = admin_user.get("id")
    assert isinstance(admin_id, int), "Invalid admin user id"

    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # Create a new user to test activate/deactivate (not self)
    unique_username = f"testuser_{uuid.uuid4().hex[:8]}"
    user_payload = {
        "username": unique_username,
        "password": "TempPass123!",
        "fullName": "Test User",
        "role": "user"
    }

    create_resp = requests.post(USERS_URL, json=user_payload, headers=headers, timeout=TIMEOUT)
    assert create_resp.status_code == 201, f"User creation failed: {create_resp.text}"
    created_user = create_resp.json().get("user")
    assert created_user and isinstance(created_user, dict), "Created user data missing"
    user_id = created_user.get("id")
    assert isinstance(user_id, int), "Invalid created user id"

    try:
        # Deactivate the created user (should succeed)
        deactivate_payload = {"isActive": False}
        deactivate_resp = requests.patch(
            f"{USERS_URL}/{user_id}/status", json=deactivate_payload, headers=headers, timeout=TIMEOUT
        )
        assert deactivate_resp.status_code == 200, f"Deactivating user failed: {deactivate_resp.text}"
        resp_data = deactivate_resp.json()
        user_status = resp_data.get("user")
        assert user_status and isinstance(user_status, dict), "Response 'user' key missing"
        assert user_status.get("id") == user_id, "Response user id mismatch"
        assert user_status.get("isActive") is False, "User not deactivated"

        # Activate the created user (should succeed)
        activate_payload = {"isActive": True}
        activate_resp = requests.patch(
            f"{USERS_URL}/{user_id}/status", json=activate_payload, headers=headers, timeout=TIMEOUT
        )
        assert activate_resp.status_code == 200, f"Activating user failed: {activate_resp.text}"
        resp_data = activate_resp.json()
        user_status = resp_data.get("user")
        assert user_status and isinstance(user_status, dict), "Response 'user' key missing"
        assert user_status.get("id") == user_id, "Response user id mismatch"
        assert user_status.get("isActive") is True, "User not activated"

        # Attempt to deactivate self (admin user) - should get 400 error
        deactivate_self_payload = {"isActive": False}
        deactivate_self_resp = requests.patch(
            f"{USERS_URL}/{admin_id}/status", json=deactivate_self_payload, headers=headers, timeout=TIMEOUT
        )
        assert deactivate_self_resp.status_code == 400, (
            f"Deactivating own account did not fail as expected, got: {deactivate_self_resp.status_code}, {deactivate_self_resp.text}"
        )
    finally:
        # Cleanup: ensure created user is activated before exit (to not lock account)
        requests.patch(
            f"{USERS_URL}/{user_id}/status", json={"isActive": True}, headers=headers, timeout=TIMEOUT
        )


test_patch_api_users_id_status_activate_deactivate_except_self()