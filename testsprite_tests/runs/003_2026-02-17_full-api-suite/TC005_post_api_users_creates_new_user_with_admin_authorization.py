import requests
import uuid

BASE_URL = "http://localhost:3000"
TIMEOUT = 30

def test_post_api_users_creates_new_user_with_admin_authorization():
    login_url = f"{BASE_URL}/api/auth/login"
    users_url = f"{BASE_URL}/api/users"

    admin_credentials = {"username": "jose", "password": "password123"}

    # Login as admin to get token
    try:
        login_resp = requests.post(login_url, json=admin_credentials, timeout=TIMEOUT)
        assert login_resp.status_code == 200, f"Admin login failed: {login_resp.text}"
        login_data = login_resp.json()
        token = login_data.get("token")
        assert token, "Token not found in login response"
    except Exception as e:
        assert False, f"Login request failed: {e}"

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    # Create a new user with a unique username
    new_username = f"testuser_{uuid.uuid4().hex[:8]}"
    new_user_payload = {
        "username": new_username,
        "password": "TestPass123!",
        "fullName": "Test User",
        "role": "user"
    }

    user_id = None

    try:
        # Create user - Expect 201 Created with user wrapped in 'user'
        create_resp = requests.post(users_url, json=new_user_payload, headers=headers, timeout=TIMEOUT)
        assert create_resp.status_code == 201, f"User creation failed: {create_resp.status_code} {create_resp.text}"
        create_data = create_resp.json()
        assert "user" in create_data, "'user' key missing in create user response"
        created_user = create_data["user"]
        assert created_user["username"] == new_username
        assert created_user["fullName"] == new_user_payload["fullName"]
        assert created_user["role"] == new_user_payload["role"]
        assert isinstance(created_user["isActive"], bool)
        user_id = created_user["id"]

        # Attempt to create duplicate username - Expect 409 Conflict
        dup_resp = requests.post(users_url, json=new_user_payload, headers=headers, timeout=TIMEOUT)
        assert dup_resp.status_code == 409, f"Duplicate username creation did not fail as expected: {dup_resp.status_code} {dup_resp.text}"

    finally:
        # Cleanup: deactivate the created user if created
        if user_id is not None:
            deactivate_url = f"{users_url}/{user_id}/status"
            patch_payload = {"isActive": False}
            try:
                patch_resp = requests.patch(deactivate_url, json=patch_payload, headers=headers, timeout=TIMEOUT)
                # Accept 200 or 404 if user already removed/deactivated by other means
                assert patch_resp.status_code in (200, 404), f"Failed to deactivate user: {patch_resp.status_code} {patch_resp.text}"
            except Exception:
                pass

test_post_api_users_creates_new_user_with_admin_authorization()