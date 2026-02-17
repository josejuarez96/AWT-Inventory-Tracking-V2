import requests
import random
import string

BASE_URL = "http://localhost:3000"
TIMEOUT = 30

def test_user_management_change_user_status_with_admin_token():
    session = requests.Session()

    def random_suffix(length=6):
        return ''.join(random.choices(string.ascii_lowercase + string.digits, k=length))

    # Step 1: Admin login to get token
    login_payload = {
        "username": "jose",
        "password": "password123"
    }
    login_resp = session.post(f"{BASE_URL}/api/auth/login", json=login_payload, timeout=TIMEOUT)
    assert login_resp.status_code == 200, f"Admin login failed: {login_resp.text}"
    login_data = login_resp.json()
    assert "token" in login_data and "user" in login_data
    token = login_data["token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Step 2: Create a new user for testing status change
    unique_username = f"testuser_{random_suffix()}"
    create_payload = {
        "username": unique_username,
        "password": "TestPass123!",
        "fullName": "Test User",
        "role": "user"
    }
    create_resp = session.post(f"{BASE_URL}/api/users", json=create_payload, headers=headers, timeout=TIMEOUT)
    assert create_resp.status_code == 201, f"User creation failed: {create_resp.text}"
    user_created = create_resp.json().get("user") or create_resp.json()
    user_id = user_created.get("id")
    assert user_id is not None, "Created user ID not found."

    # Prepare a function to delete the test user after test
    def cleanup_user(user_id_to_delete):
        session.delete(f"{BASE_URL}/api/users/{user_id_to_delete}", headers=headers, timeout=TIMEOUT)

    try:
        # Step 3: Deactivate the user (set isActive to False)
        patch_payload = {"isActive": False}
        patch_resp = session.patch(f"{BASE_URL}/api/users/{user_id}/status", json=patch_payload, headers=headers, timeout=TIMEOUT)
        assert patch_resp.status_code == 200, f"Deactivate user failed: {patch_resp.text}"
        user_after_deactivate = patch_resp.json().get("user")
        assert user_after_deactivate is not None, "Response missing user after deactivate"
        assert user_after_deactivate.get("id") == user_id, "User ID mismatch after deactivate"
        assert user_after_deactivate.get("isActive") is False, "User isActive flag not set to False"

        # Step 4: Activate the user (set isActive to True)
        patch_payload = {"isActive": True}
        patch_resp = session.patch(f"{BASE_URL}/api/users/{user_id}/status", json=patch_payload, headers=headers, timeout=TIMEOUT)
        assert patch_resp.status_code == 200, f"Activate user failed: {patch_resp.text}"
        user_after_activate = patch_resp.json().get("user")
        assert user_after_activate is not None, "Response missing user after activate"
        assert user_after_activate.get("id") == user_id, "User ID mismatch after activate"
        assert user_after_activate.get("isActive") is True, "User isActive flag not set to True"

    finally:
        # Cleanup test user
        cleanup_user(user_id)

test_user_management_change_user_status_with_admin_token()