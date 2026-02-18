import requests
import time

BASE_URL = "http://localhost:3000"
TIMEOUT = 30

def test_patch_api_users_id_status_activates_or_deactivates_user_account():
    # Authenticate as admin user 'jose'
    login_resp = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": "jose", "password": "password123"},
        timeout=TIMEOUT,
    )
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    login_data = login_resp.json()
    token = login_data.get("token")
    assert token, "No token returned from login"
    admin_user = login_data.get("user")
    assert admin_user, "No user data returned from login"
    admin_user_id = admin_user.get("id")
    assert admin_user_id is not None, "Admin user id missing"

    headers = {"Authorization": f"Bearer {token}"}

    # Create a new user to test deactivation/reactivation
    timestamp_suffix = int(time.time() * 1000)
    new_username = f"testuser_tc007_{timestamp_suffix}"
    new_user_payload = {
        "username": new_username,
        "password": "TestPass123!",
        "fullName": "Test User TC007",
        "role": "user"
    }
    create_resp = requests.post(
        f"{BASE_URL}/api/users",
        headers=headers,
        json=new_user_payload,
        timeout=TIMEOUT,
    )
    assert create_resp.status_code == 201, f"User creation failed: {create_resp.text}"
    created_user = create_resp.json().get("user")
    assert created_user, "Response missing 'user' key for created user"
    user_id = created_user.get("id")
    assert user_id is not None, "Created user id missing"

    try:
        # Deactivate the created user account
        patch_deactivate_resp = requests.patch(
            f"{BASE_URL}/api/users/{user_id}/status",
            headers=headers,
            json={"isActive": False},
            timeout=TIMEOUT,
        )
        assert patch_deactivate_resp.status_code == 200, (
            f"Deactivating user failed: {patch_deactivate_resp.text}"
        )
        deactivated_user = patch_deactivate_resp.json().get("user")
        assert deactivated_user, "Response missing 'user' key on deactivate"
        assert deactivated_user.get("id") == user_id, "Deactivated user id mismatch"
        assert deactivated_user.get("isActive") is False, "User isActive not set to False on deactivate"

        # Reactivate the same user account
        patch_reactivate_resp = requests.patch(
            f"{BASE_URL}/api/users/{user_id}/status",
            headers=headers,
            json={"isActive": True},
            timeout=TIMEOUT,
        )
        assert patch_reactivate_resp.status_code == 200, (
            f"Reactivating user failed: {patch_reactivate_resp.text}"
        )
        reactivated_user = patch_reactivate_resp.json().get("user")
        assert reactivated_user, "Response missing 'user' key on reactivate"
        assert reactivated_user.get("id") == user_id, "Reactivated user id mismatch"
        assert reactivated_user.get("isActive") is True, "User isActive not set to True on reactivate"

        # Attempt to deactivate own admin account, expect 400
        patch_own_deactivate_resp = requests.patch(
            f"{BASE_URL}/api/users/{admin_user_id}/status",
            headers=headers,
            json={"isActive": False},
            timeout=TIMEOUT,
        )
        assert patch_own_deactivate_resp.status_code == 400, (
            f"Deactivating own account did not fail as expected: {patch_own_deactivate_resp.text}"
        )
        err_text = patch_own_deactivate_resp.text.lower()
        assert "cannot deactivate own account" in err_text or "cannot" in err_text, (
            "Error message does not mention cannot deactivate own account"
        )

    finally:
        # Cleanup: Reactivate the test user in case still deactivated
        requests.patch(
            f"{BASE_URL}/api/users/{user_id}/status",
            headers=headers,
            json={"isActive": True},
            timeout=TIMEOUT,
        )


test_patch_api_users_id_status_activates_or_deactivates_user_account()
