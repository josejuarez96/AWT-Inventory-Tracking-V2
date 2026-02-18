import requests
import uuid

BASE_URL = "http://localhost:3000"
TIMEOUT = 30

def test_post_api_users_create_user_with_valid_and_duplicate_username():
    # Step 1: Authenticate as admin to get JWT token
    login_url = f"{BASE_URL}/api/auth/login"
    login_payload = {"username": "jose", "password": "password123"}
    try:
        login_resp = requests.post(login_url, json=login_payload, timeout=TIMEOUT)
        assert login_resp.status_code == 200, f"Login failed with status {login_resp.status_code}"
        login_data = login_resp.json()
        token = login_data.get("token")
        assert token, "No token returned from login"
    except Exception as e:
        raise AssertionError(f"Exception during admin login: {e}")

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    # Generate unique username for test to avoid conflict with existing usernames unintentionally
    unique_username = f"testuser_{uuid.uuid4().hex[:8]}"
    valid_password = "TestPass1"  # meets password policy

    user_create_url = f"{BASE_URL}/api/users"

    # Keep track of created user id to deactivate after test (since no DELETE)
    created_user_id = None

    try:
        # Test valid user creation
        valid_user_payload = {
            "username": unique_username,
            "password": valid_password,
            "fullName": "Test User",
            "role": "user"
        }

        resp_valid_create = requests.post(user_create_url, json=valid_user_payload, headers=headers, timeout=TIMEOUT)
        assert resp_valid_create.status_code == 201, f"Expected 201 on user create, got {resp_valid_create.status_code}"
        valid_create_data = resp_valid_create.json()
        assert "user" in valid_create_data, "Response missing 'user' key on successful create"
        user = valid_create_data["user"]
        assert user["username"] == unique_username, "Username in response does not match request"
        assert user["fullName"] == "Test User", "fullName in response does not match request"
        assert user["role"] == "user", "role in response does not match request"
        assert isinstance(user.get("id"), int), "User id is missing or not integer"
        assert isinstance(user.get("isActive"), bool), "User isActive missing or invalid"

        created_user_id = user["id"]

        # Test duplicate username creation (use same username again)
        dup_user_payload = {
            "username": unique_username,
            "password": valid_password,
            "fullName": "Duplicate User",
            "role": "user"
        }
        resp_dup_create = requests.post(user_create_url, json=dup_user_payload, headers=headers, timeout=TIMEOUT)
        assert resp_dup_create.status_code == 409, f"Expected 409 on duplicate username, got {resp_dup_create.status_code}"
        resp_dup_data = resp_dup_create.json()
        # The 409 response schema says "Username already taken" message expected as string
        # Check message is present and mentions username taken
        if isinstance(resp_dup_data, dict):
            msg_values = resp_dup_data.values()
            assert any("username" in str(v).lower() and "taken" in str(v).lower() for v in msg_values), \
                "Duplicate username error message missing or incorrect"
        else:
            raise AssertionError("Duplicate username response is not a JSON object")

    finally:
        # Cleanup: deactivate created user since no DELETE endpoint
        if created_user_id is not None:
            status_url = f"{BASE_URL}/api/users/{created_user_id}/status"
            patch_payload = {"isActive": False}
            try:
                resp_deactivate = requests.patch(status_url, json=patch_payload, headers=headers, timeout=TIMEOUT)
                # 200 expected on successful status change
                assert resp_deactivate.status_code == 200, f"Failed to deactivate user, status {resp_deactivate.status_code}"
                deactivate_data = resp_deactivate.json()
                assert "user" in deactivate_data and deactivate_data["user"]["isActive"] is False, \
                    "User not properly deactivated in response"
            except Exception as e:
                # Log but do not fail cleanup
                print(f"Warning: Exception during user deactivation cleanup: {e}")

test_post_api_users_create_user_with_valid_and_duplicate_username()