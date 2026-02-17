import requests
import uuid

BASE_URL = "http://localhost:3000"
TIMEOUT = 30


def login(username: str, password: str):
    resp = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": username, "password": password},
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    data = resp.json()
    token = data["token"]
    user = data["user"]
    return token, user


def create_user(token: str, username: str, password: str, full_name: str, role: str):
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.post(
        f"{BASE_URL}/api/users",
        headers=headers,
        json={"username": username, "password": password, "fullName": full_name, "role": role},
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    data = resp.json()
    return data["user"]


def patch_user_status(token: str, user_id: int, is_active: bool):
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.patch(
        f"{BASE_URL}/api/users/{user_id}/status",
        headers=headers,
        json={"isActive": is_active},
        timeout=TIMEOUT,
    )
    return resp


def delete_user(token: str, user_id: int):
    headers = {"Authorization": f"Bearer {token}"}
    # Use DELETE /api/users/:id if supported; if not, skip deleting
    # PRD does not mention DELETE endpoint, so skip delete.
    pass


def test_TC008_user_activate_deactivate_account_with_admin_auth():
    # Login as admin user "jose"
    admin_token, admin_user = login("jose", "password123")
    admin_id = admin_user["id"]

    # Create a new user with random username suffix
    rand_suffix = uuid.uuid4().hex[:8]
    test_username = f"testuser_{rand_suffix}"
    test_password = "password123"
    test_full_name = "Test User TC008"
    test_role = "user"

    user = None
    try:
        user = create_user(admin_token, test_username, test_password, test_full_name, test_role)
        user_id = user["id"]

        # Deactivate the created user account - expect HTTP 200 and user updated with isActive false
        resp_deactivate = patch_user_status(admin_token, user_id, False)
        assert resp_deactivate.status_code == 200, f"Expected 200 on deactivate, got {resp_deactivate.status_code}"
        data_deactivate = resp_deactivate.json()
        user_deactivate = data_deactivate.get("user")
        assert user_deactivate is not None, "Response JSON missing 'user' key on deactivate"
        assert user_deactivate["id"] == user_id
        assert user_deactivate["isActive"] is False

        # Activate the created user account - expect HTTP 200 and user updated with isActive true
        resp_activate = patch_user_status(admin_token, user_id, True)
        assert resp_activate.status_code == 200, f"Expected 200 on activate, got {resp_activate.status_code}"
        data_activate = resp_activate.json()
        user_activate = data_activate.get("user")
        assert user_activate is not None, "Response JSON missing 'user' key on activate"
        assert user_activate["id"] == user_id
        assert user_activate["isActive"] is True

        # Attempt to deactivate own admin account, expect HTTP 400 with error message "Cannot deactivate your own account"
        resp_deactivate_admin = patch_user_status(admin_token, admin_id, False)
        assert resp_deactivate_admin.status_code == 400, f"Expected 400 on deactivating own account, got {resp_deactivate_admin.status_code}"
        data_admin_err = resp_deactivate_admin.json()
        # Check for "error" key, exact message per PRD
        assert "error" in data_admin_err, "Response missing 'error' key on own account deactivate"
        assert data_admin_err["error"] == "Cannot deactivate your own account"

    finally:
        # Cleanup: No delete endpoint described in PRD, so skip cleanup (or implement if available)
        pass


test_TC008_user_activate_deactivate_account_with_admin_auth()