import requests
import uuid

BASE_URL = "http://localhost:3000"
TIMEOUT = 30

def login(username: str, password: str) -> str:
    url = f"{BASE_URL}/api/auth/login"
    resp = requests.post(url, json={"username": username, "password": password}, timeout=TIMEOUT)
    resp.raise_for_status()
    token = resp.json().get("token")
    assert token, "Login did not return a token"
    return token

def create_user(token: str, username: str, password: str, fullName: str, role: str):
    url = f"{BASE_URL}/api/users"
    headers = {"Authorization": f"Bearer {token}"}
    payload = {"username": username, "password": password, "fullName": fullName, "role": role}
    resp = requests.post(url, json=payload, headers=headers, timeout=TIMEOUT)
    return resp

def update_user(token: str, user_id: int, fullName=None, role=None, password=None):
    url = f"{BASE_URL}/api/users/{user_id}"
    headers = {"Authorization": f"Bearer {token}"}
    body = {}
    if fullName is not None:
        body["fullName"] = fullName
    if role is not None:
        body["role"] = role
    if password is not None:
        body["password"] = password
    resp = requests.put(url, json=body, headers=headers, timeout=TIMEOUT)
    return resp

def patch_user_status(token: str, user_id: int, isActive: bool):
    url = f"{BASE_URL}/api/users/{user_id}/status"
    headers = {"Authorization": f"Bearer {token}"}
    payload = {"isActive": isActive}
    resp = requests.patch(url, json=payload, headers=headers, timeout=TIMEOUT)
    return resp

def list_users(token: str):
    url = f"{BASE_URL}/api/users"
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.get(url, headers=headers, timeout=TIMEOUT)
    return resp

def test_user_management_list_create_update_and_status_toggle_with_admin_authorization():
    admin_username = "jose"
    admin_password = "password123"
    # Login admin and get token
    admin_token = login(admin_username, admin_password)

    # 1. List users as admin - should succeed with 200 and users array
    resp = list_users(admin_token)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)
    assert "users" in data
    assert isinstance(data["users"], list)

    # 2. Create a new user as admin - should succeed with 201 and user object
    test_username = f"testuser_{uuid.uuid4().hex[:8]}"
    test_password = "TestPass123!"
    test_fullName = "Test User"
    test_role = "user"
    resp = create_user(admin_token, test_username, test_password, test_fullName, test_role)
    assert resp.status_code == 201
    created_user = resp.json().get("user")
    assert created_user and created_user["username"] == test_username
    user_id = created_user["id"]

    try:
        # 3. Attempt to create a user with duplicate username - expect 409 conflict
        resp_dup = create_user(admin_token, test_username, "AnotherPass1!", "Another User", "user")
        assert resp_dup.status_code == 409

        # 4. Update user with valid data - expect 200 and updated user data
        new_fullName = "Updated Test User"
        new_role = "admin"
        new_password = "NewPass123!"
        resp_update = update_user(admin_token, user_id, fullName=new_fullName, role=new_role, password=new_password)
        assert resp_update.status_code == 200
        updated_user = resp_update.json().get("user")
        assert updated_user and updated_user["id"] == user_id
        assert updated_user.get("fullName") == new_fullName
        assert updated_user.get("role") == new_role

        # 5. Update user with invalid id - expect 404
        invalid_user_id = 99999999
        resp_update_invalid = update_user(admin_token, invalid_user_id, fullName="No User")
        assert resp_update_invalid.status_code == 404

        # 6. Deactivate the created user (not own account) - expect 200 and isActive false
        resp_deactivate = patch_user_status(admin_token, user_id, isActive=False)
        assert resp_deactivate.status_code == 200
        resp_data = resp_deactivate.json()
        assert "user" in resp_data
        assert resp_data["user"]["id"] == user_id
        assert resp_data["user"]["isActive"] is False

        # 7. Reactivate the created user for cleanup - expect 200 and isActive true
        resp_reactivate = patch_user_status(admin_token, user_id, isActive=True)
        assert resp_reactivate.status_code == 200
        assert resp_reactivate.json()["user"]["isActive"] is True

        # 8. Attempt to deactivate own admin account - expect 400 error
        # First get admin user ID from token data
        url_me = f"{BASE_URL}/api/auth/me"
        headers_admin = {"Authorization": f"Bearer {admin_token}"}
        resp_me = requests.get(url_me, headers=headers_admin, timeout=TIMEOUT)
        resp_me.raise_for_status()
        admin_user_id = resp_me.json()["user"]["id"]

        resp_deactivate_own = patch_user_status(admin_token, admin_user_id, isActive=False)
        assert resp_deactivate_own.status_code == 400

        # 9. Login a non-admin user and try to list users - expect 403
        # Create a non-admin user first
        nonadmin_username = f"nonadmin_{uuid.uuid4().hex[:8]}"
        nonadmin_password = "NonAdminPass123!"
        resp_na_create = create_user(admin_token, nonadmin_username, nonadmin_password, "Non Admin User", "user")
        assert resp_na_create.status_code == 201
        nonadmin_user_id = resp_na_create.json()["user"]["id"]

        # Login non-admin user
        nonadmin_token = login(nonadmin_username, nonadmin_password)

        # Try to list users as non-admin - expect 403
        resp_list_nonadmin = list_users(nonadmin_token)
        assert resp_list_nonadmin.status_code == 403

    finally:
        # Cleanup: delete the created test user by deactivating them
        # We only can deactivate; no delete endpoint
        patch_user_status(admin_token, user_id, isActive=False).raise_for_status()

        # Also deactivate nonadmin user if created
        if 'nonadmin_user_id' in locals():
            patch_user_status(admin_token, nonadmin_user_id, isActive=False).raise_for_status()

test_user_management_list_create_update_and_status_toggle_with_admin_authorization()