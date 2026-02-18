import requests

BASE_URL = "http://localhost:3000"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
USERS_URL = f"{BASE_URL}/api/users"
TIMEOUT = 30

def test_get_api_users_returns_user_list_for_admin_only():
    # Helper function to login and return token for given credentials
    def login(username, password):
        resp = requests.post(
            LOGIN_URL,
            json={"username": username, "password": password},
            timeout=TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
        return data["token"]

    # Login as admin user (updated credentials to 'admin')
    admin_token = login("admin", "admin123")
    # Login as non-admin user - we need a non-admin user; Using "alice" as example
    # Since the test metadata doesn't provide non-admin credentials, we create a non-admin user first.
    non_admin_username = "testuser_nonadmin_tc005"
    non_admin_password = "testpass123"
    non_admin_user_id = None

    # Create non-admin user using admin token (cleanup after test)
    try:
        # Create non-admin user
        create_resp = requests.post(
            USERS_URL,
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "username": non_admin_username,
                "password": non_admin_password,
                "fullName": "Test Non Admin User TC005",
                "role": "user"
            },
            timeout=TIMEOUT,
        )
        # If user exists, accept existing; else assert created
        if create_resp.status_code == 201:
            user_data = create_resp.json()
            non_admin_user_id = user_data["user"]["id"]
        elif create_resp.status_code == 409:
            # User already exists - retrieve token anyway
            token_resp = requests.post(
                LOGIN_URL,
                json={"username": non_admin_username, "password": non_admin_password},
                timeout=TIMEOUT,
            )
            token_resp.raise_for_status()
            user_data = token_resp.json()
            non_admin_user_id = None  # We do not need id if user existed already
        else:
            create_resp.raise_for_status()

        # Login as non-admin user to get token
        non_admin_token = login(non_admin_username, non_admin_password)

        # Test GET /api/users with admin token (expect 200 and users array)
        admin_users_resp = requests.get(
            USERS_URL,
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=TIMEOUT,
        )
        assert admin_users_resp.status_code == 200, f"Expected 200 for admin GET /api/users but got {admin_users_resp.status_code}"
        admin_data = admin_users_resp.json()
        assert isinstance(admin_data, dict), "Admin GET /api/users response not a dict"
        assert "users" in admin_data, "Admin GET /api/users response missing 'users' key"
        assert isinstance(admin_data["users"], list), "'users' key is not a list for admin GET /api/users"

        # Test GET /api/users with non-admin token (expect 403)
        non_admin_users_resp = requests.get(
            USERS_URL,
            headers={"Authorization": f"Bearer {non_admin_token}"},
            timeout=TIMEOUT,
        )
        assert non_admin_users_resp.status_code == 403, f"Expected 403 for non-admin GET /api/users but got {non_admin_users_resp.status_code}"
        non_admin_data = non_admin_users_resp.json()
        assert "message" in non_admin_data or "error" in non_admin_data, "Non-admin 403 response missing error message"

    finally:
        # Cleanup: deactivate the test non-admin user if created
        if non_admin_user_id:
            # Patch user status to isActive: false
            patch_resp = requests.patch(
                f"{USERS_URL}/{non_admin_user_id}/status",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={"isActive": False},
                timeout=TIMEOUT,
            )
            # ignore errors in cleanup


test_get_api_users_returns_user_list_for_admin_only()
