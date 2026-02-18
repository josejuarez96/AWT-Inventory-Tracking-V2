import requests
import uuid

BASE_URL = "http://localhost:3000"
TIMEOUT = 30

def test_post_api_users_creates_new_user_with_unique_username():
    session = requests.Session()
    try:
        # Authenticate as admin
        login_resp = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "jose", "password": "admin123"},
            timeout=TIMEOUT,
        )
        assert login_resp.status_code == 200, f"Admin login failed: {login_resp.text}"
        token = login_resp.json().get("token")
        assert token, "No token received on login"
        headers = {"Authorization": f"Bearer {token}"}

        # Create unique username
        unique_username = f"testuser_{uuid.uuid4().hex[:8]}"
        user_data = {
            "username": unique_username,
            "password": "Password123!",
            "fullName": "Test User",
            "role": "user",
        }

        # Create new user - expect 201
        create_resp = session.post(
            f"{BASE_URL}/api/users",
            json=user_data,
            headers=headers,
            timeout=TIMEOUT,
        )
        assert create_resp.status_code == 201, f"User creation failed: {create_resp.text}"
        create_json = create_resp.json()
        assert "user" in create_json, "Response JSON missing 'user' key"
        user = create_json["user"]
        assert user["username"] == unique_username, "Usernames do not match"
        assert user["fullName"] == "Test User"
        assert user["role"] == "user"
        user_id = user["id"]
        assert isinstance(user_id, int) and user_id > 0

        # Attempt to create user with duplicate username - expect 409
        dup_resp = session.post(
            f"{BASE_URL}/api/users",
            json=user_data,
            headers=headers,
            timeout=TIMEOUT,
        )
        assert dup_resp.status_code == 409, f"Duplicate username did not cause 409: {dup_resp.text}"

    finally:
        # Cleanup: deactivate the created user (soft delete)
        if 'user_id' in locals():
            patch_resp = session.patch(
                f"{BASE_URL}/api/users/{user_id}/status",
                json={"isActive": False},
                headers=headers,
                timeout=TIMEOUT,
            )
            # Accept 200 or 404 if already deleted/disappeared
            assert patch_resp.status_code in (200, 404), f"Failed to deactivate user: {patch_resp.text}"

test_post_api_users_creates_new_user_with_unique_username()