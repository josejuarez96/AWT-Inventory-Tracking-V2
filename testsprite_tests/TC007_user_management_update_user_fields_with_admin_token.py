import requests
import uuid

BASE_URL = "http://localhost:3000"
TIMEOUT = 30

def test_TC007_user_management_update_user_fields_with_admin_token():
    # Authenticate as admin to get token
    login_payload = {
        "username": "jose",
        "password": "password123"
    }
    try:
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json=login_payload, timeout=TIMEOUT)
        assert login_resp.status_code == 200, f"Admin login failed with status {login_resp.status_code}"
        login_data = login_resp.json()
        admin_token = login_data.get("token")
        assert admin_token is not None, "Admin token not found in login response"
    except Exception as e:
        raise AssertionError(f"Admin login request failed: {e}")

    headers = {
        "Authorization": f"Bearer {admin_token}"
    }

    # Create a new user to update (ensuring unique username)
    unique_suffix = str(uuid.uuid4())[:8]
    new_user_payload = {
        "username": f"testuser_{unique_suffix}",
        "password": "Testpass123!",
        "fullName": "Original Name",
        "role": "user"
    }
    try:
        create_resp = requests.post(f"{BASE_URL}/api/users", json=new_user_payload, headers=headers, timeout=TIMEOUT)
        assert create_resp.status_code == 201, f"User creation failed with status {create_resp.status_code}"
        create_data = create_resp.json()
        created_user = create_data.get("user")
        assert created_user and "id" in created_user, "Created user object missing or id not found"
        user_id = created_user["id"]
    except Exception as e:
        raise AssertionError(f"User creation failed: {e}")

    try:
        # Prepare update payload with valid fields
        updated_full_name = "Updated Name"
        updated_role = "admin"
        updated_password = "NewPassw0rd!"
        update_payload = {
            "fullName": updated_full_name,
            "role": updated_role,
            "password": updated_password
        }

        # Send PUT request to update the user
        update_resp = requests.put(f"{BASE_URL}/api/users/{user_id}", json=update_payload, headers=headers, timeout=TIMEOUT)
        assert update_resp.status_code == 200, f"User update failed with status {update_resp.status_code}"
        update_data = update_resp.json()
        updated_user = update_data.get("user")
        assert updated_user is not None, "Updated user object not found in response"

        # Validate updated fields in response (password hash should not be returned per contract)
        assert updated_user.get("id") == user_id, "Updated user id mismatch"
        assert updated_user.get("fullName") == updated_full_name, "fullName not updated correctly"
        assert updated_user.get("role") == updated_role, "role not updated correctly"
        # Password field should not be returned, check no password or sensitive info present
        assert "password" not in updated_user, "Password field should not be present in response"
    finally:
        # Cleanup: delete the created user
        try:
            del_resp = requests.delete(f"{BASE_URL}/api/users/{user_id}", headers=headers, timeout=TIMEOUT)
            # The API contract does not specify delete response, but ensure 200 or 204 for success
            assert del_resp.status_code in (200, 204), f"Failed to delete user with status {del_resp.status_code}"
        except Exception as cleanup_exc:
            # Log the cleanup failure but do not raise to not mask test errors
            print(f"Warning: Failed to clean up user {user_id}: {cleanup_exc}")

test_TC007_user_management_update_user_fields_with_admin_token()