import requests
import uuid

BASE_URL = "http://localhost:3000"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
USERS_URL = f"{BASE_URL}/api/users"

def test_put_api_users_id_updates_user_profile_with_admin_authorization():
    timeout = 30
    admin_credentials = {"username": "jose", "password": "password123"}

    # Authenticate as admin to get JWT token
    try:
        resp_login = requests.post(LOGIN_URL, json=admin_credentials, timeout=timeout)
        resp_login.raise_for_status()
    except Exception as e:
        raise AssertionError(f"Login request failed: {e}")
    data_login = resp_login.json()
    token = data_login.get("token")
    assert token and isinstance(token, str), "Token not found or invalid in login response"
    headers = {"Authorization": f"Bearer {token}"}

    # Create a new user to update (cleanup with deactivation after)
    new_username = f"testuser_{uuid.uuid4().hex[:8]}"
    new_user_payload = {
        "username": new_username,
        "password": "TestPass123!",
        "fullName": "Test User Original",
        "role": "user"
    }
    try:
        resp_create = requests.post(USERS_URL, json=new_user_payload, headers=headers, timeout=timeout)
        resp_create.raise_for_status()
        assert resp_create.status_code == 201, f"Expected 201 Created but got {resp_create.status_code}"
        data_create = resp_create.json()
        created_user = data_create.get("user")
        assert created_user and "id" in created_user, "User ID missing in create response"
        user_id = created_user["id"]

        # Prepare update payload
        update_payload = {
            "fullName": "Test User Updated",
            "role": "admin"
        }

        # Perform PUT update on the user ID
        resp_update = requests.put(f"{USERS_URL}/{user_id}", json=update_payload, headers=headers, timeout=timeout)
        resp_update.raise_for_status()
        assert resp_update.status_code == 200, f"Expected 200 OK but got {resp_update.status_code}"
        data_update = resp_update.json()
        updated_user = data_update.get("user")
        assert updated_user, "Missing 'user' key in response body"
        assert updated_user["id"] == user_id, "Updated user ID does not match"
        assert updated_user["fullName"] == update_payload["fullName"], "User fullName was not updated correctly"
        assert updated_user["role"] == update_payload["role"], "User role was not updated correctly"
        assert updated_user["username"] == new_username, "Username should remain unchanged"

    finally:
        # Cleanup: deactivate the created user to emulate "deleting" since no DELETE endpoint
        try:
            patch_url = f"{USERS_URL}/{user_id}/status"
            patch_payload = {"isActive": False}
            resp_deactivate = requests.patch(patch_url, json=patch_payload, headers=headers, timeout=timeout)
            if resp_deactivate.status_code != 200:
                raise AssertionError(f"Failed to deactivate test user {user_id}, status: {resp_deactivate.status_code}")
        except Exception as exc:
            # Log deactivation failure but don't raise to avoid masking original exceptions
            print(f"Warning: failed to deactivate test user during cleanup: {exc}")

test_put_api_users_id_updates_user_profile_with_admin_authorization()