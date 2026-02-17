import requests
import uuid

BASE_URL = "http://localhost:3000"
TIMEOUT = 30

def test_put_api_users_id_updates_user_details_with_admin_authorization():
    try:
        # Step 1: Authenticate as admin (jose)
        login_resp = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "jose", "password": "password123"},
            timeout=TIMEOUT,
        )
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        token = login_resp.json().get("token")
        assert token, "No token in login response"
        headers = {"Authorization": f"Bearer {token}"}

        # Step 2: Create new user to update (to ensure valid user id)
        unique_username = f"user_{uuid.uuid4().hex[:8]}"
        new_user_payload = {
            "username": unique_username,
            "password": "TestPass123!",
            "fullName": "Original FullName",
            "role": "user"
        }
        create_resp = requests.post(
            f"{BASE_URL}/api/users",
            headers=headers,
            json=new_user_payload,
            timeout=TIMEOUT,
        )
        assert create_resp.status_code == 201, f"User creation failed: {create_resp.text}"
        user_data = create_resp.json().get("user")
        assert user_data, "No 'user' key in create user response"
        user_id = user_data.get("id")
        assert user_id, "Created user has no id"

        # Step 3: Update user details: fullName and role
        update_payload = {
            "fullName": "Updated FullName",
            "role": "admin"
        }
        update_resp = requests.put(
            f"{BASE_URL}/api/users/{user_id}",
            headers={**headers, "Content-Type": "application/json"},
            json=update_payload,
            timeout=TIMEOUT,
        )
        assert update_resp.status_code == 200, f"User update failed: {update_resp.text}"
        updated_user = update_resp.json().get("user")
        assert updated_user, "No 'user' key in update response"
        assert updated_user.get("id") == user_id, "Updated user ID mismatch"
        assert updated_user.get("fullName") == update_payload["fullName"], "fullName not updated"
        assert updated_user.get("role") == update_payload["role"], "role not updated"

    finally:
        # Cleanup: Deactivate the created user (soft-delete)
        # No DELETE endpoint; only PATCH /api/users/:id/status to deactivate
        if 'token' in locals() and 'user_id' in locals():
            try:
                patch_resp = requests.patch(
                    f"{BASE_URL}/api/users/{user_id}/status",
                    headers={**headers, "Content-Type": "application/json"},
                    json={"isActive": False},
                    timeout=TIMEOUT,
                )
                # Ignore patch errors to not mask the main test result
            except Exception:
                pass


test_put_api_users_id_updates_user_details_with_admin_authorization()