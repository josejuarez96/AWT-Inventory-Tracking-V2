import requests
import uuid

BASE_URL = "http://localhost:3000"
LOGIN_ENDPOINT = "/api/auth/login"
USERS_ENDPOINT = "/api/users"

def test_patch_api_users_id_status_activates_or_deactivates_user_with_admin_authorization():
    timeout = 30

    # Step 1: Authenticate as admin to get JWT token
    login_resp = requests.post(
        f"{BASE_URL}{LOGIN_ENDPOINT}",
        json={"username": "jose", "password": "password123"},
        timeout=timeout,
    )
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    login_data = login_resp.json()
    admin_token = login_data.get("token")
    assert admin_token, "No token received from login"

    headers = {"Authorization": f"Bearer {admin_token}"}

    # Step 2: Create a new test user (to avoid deactivating self or using unknown id)
    unique_username = f"testuser_{uuid.uuid4().hex[:8]}"
    new_user_payload = {
        "username": unique_username,
        "password": "Testpass123!",
        "fullName": "Test User",
        "role": "user"
    }
    create_resp = requests.post(
        f"{BASE_URL}{USERS_ENDPOINT}",
        headers=headers,
        json=new_user_payload,
        timeout=timeout,
    )
    assert create_resp.status_code == 201, f"User creation failed: {create_resp.text}"
    create_data = create_resp.json()
    user = create_data.get("user")
    assert user and "id" in user, "User creation response missing user id"
    user_id = user["id"]

    try:
        # Step 3: PATCH to deactivate the user (isActive: false)
        patch_payload = {"isActive": False}
        patch_resp = requests.patch(
            f"{BASE_URL}{USERS_ENDPOINT}/{user_id}/status",
            headers={**headers, "Content-Type": "application/json"},
            json=patch_payload,
            timeout=timeout,
        )
        assert patch_resp.status_code == 200, f"Patch deactivate failed: {patch_resp.text}"
        patch_data = patch_resp.json()
        patched_user = patch_data.get("user")
        assert patched_user, "Patch response missing 'user' key"
        assert patched_user["id"] == user_id, "Patched user id mismatch"
        assert patched_user["isActive"] is False, "User was not deactivated"

        # Step 4: PATCH to activate the user (isActive: true)
        patch_payload = {"isActive": True}
        patch_resp = requests.patch(
            f"{BASE_URL}{USERS_ENDPOINT}/{user_id}/status",
            headers={**headers, "Content-Type": "application/json"},
            json=patch_payload,
            timeout=timeout,
        )
        assert patch_resp.status_code == 200, f"Patch activate failed: {patch_resp.text}"
        patch_data = patch_resp.json()
        patched_user = patch_data.get("user")
        assert patched_user, "Patch response missing 'user' key"
        assert patched_user["id"] == user_id, "Patched user id mismatch"
        assert patched_user["isActive"] is True, "User was not activated"

    finally:
        # Cleanup: Deactivate the user to soft-delete (no delete endpoint exists)
        cleanup_payload = {"isActive": False}
        requests.patch(
            f"{BASE_URL}{USERS_ENDPOINT}/{user_id}/status",
            headers={**headers, "Content-Type": "application/json"},
            json=cleanup_payload,
            timeout=timeout,
        )

test_patch_api_users_id_status_activates_or_deactivates_user_with_admin_authorization()