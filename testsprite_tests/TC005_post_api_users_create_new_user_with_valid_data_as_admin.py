import requests
import uuid

BASE_URL = "http://localhost:3002"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
USERS_URL = f"{BASE_URL}/api/users"
TIMEOUT = 30

def test_post_api_users_create_new_user_with_valid_data_as_admin():
    # Admin credentials
    admin_username = "jose"
    admin_password = "Password1"

    # Step 1: Authenticate as admin to get token
    try:
        login_resp = requests.post(
            LOGIN_URL,
            json={"username": admin_username, "password": admin_password},
            timeout=TIMEOUT,
        )
        assert login_resp.status_code == 200, f"Login failed with status {login_resp.status_code}"
        login_json = login_resp.json()
        token = login_json.get("token")
        assert token and isinstance(token, str), "No token returned in login response"
    except Exception as e:
        raise AssertionError(f"Admin login failed: {e}")

    headers = {"Authorization": f"Bearer {token}"}

    # Prepare unique user data for creation
    unique_suffix = str(uuid.uuid4())[:8]
    new_username = f"testuser_{unique_suffix}"
    new_user_data = {
        "username": new_username,
        "password": "StrongPass1",
        "fullName": "Test User",
        "role": "user"
    }

    # Step 2: Create new user with valid data as admin
    user_id_created = None
    try:
        create_resp = requests.post(
            USERS_URL,
            json=new_user_data,
            headers=headers,
            timeout=TIMEOUT,
        )
        assert create_resp.status_code == 201, f"User creation failed with status {create_resp.status_code}"
        create_json = create_resp.json()
        user_obj = create_json.get("user")
        assert user_obj and isinstance(user_obj, dict), "User object missing in response"
        assert user_obj.get("username") == new_username, "Returned username does not match"
        assert user_obj.get("fullName") == new_user_data["fullName"], "Returned fullName does not match"
        assert user_obj.get("role") == new_user_data["role"], "Returned role does not match"
        user_id_created = user_obj.get("id")
        assert isinstance(user_id_created, int), "User ID is missing or not an integer"
    except Exception as e:
        raise AssertionError(f"User creation test failed: {e}")

    # Step 3: Cleanup - deactivate the created user (soft-delete)
    if user_id_created:
        try:
            patch_url = f"{USERS_URL}/{user_id_created}/status"
            patch_resp = requests.patch(
                patch_url,
                json={"isActive": False},
                headers=headers,
                timeout=TIMEOUT,
            )
            # Per PRD, expect 200 with user object on success
            assert patch_resp.status_code == 200, f"User deactivation failed with status {patch_resp.status_code}"
            patch_json = patch_resp.json()
            user_after_patch = patch_json.get("user")
            assert user_after_patch and user_after_patch.get("isActive") is False, "User not deactivated properly"
        except Exception as e:
            raise AssertionError(f"Cleanup failed to deactivate user: {e}")

test_post_api_users_create_new_user_with_valid_data_as_admin()