import requests

BASE_URL = "http://localhost:3000"
TIMEOUT = 30


def test_user_management_get_users_requires_admin_access():
    login_url = f"{BASE_URL}/api/auth/login"
    users_url = f"{BASE_URL}/api/users"

    admin_credentials = {"username": "jose", "password": "Password1"}
    user_credentials = {"username": "alix", "password": "Password1"}

    try:
        # Login as admin
        admin_login_resp = requests.post(login_url, json=admin_credentials, timeout=TIMEOUT)
        assert admin_login_resp.status_code == 200, f"Admin login failed: {admin_login_resp.text}"
        admin_token = admin_login_resp.json().get("token")
        assert admin_token and isinstance(admin_token, str)

        # Use admin token to get users list - expect 200 and users array
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        get_users_admin_resp = requests.get(users_url, headers=admin_headers, timeout=TIMEOUT)
        assert get_users_admin_resp.status_code == 200, f"Admin GET /api/users failed: {get_users_admin_resp.text}"
        users_data = get_users_admin_resp.json()
        assert "users" in users_data and isinstance(users_data["users"], list)

        # Login as a standard user
        user_login_resp = requests.post(login_url, json=user_credentials, timeout=TIMEOUT)
        assert user_login_resp.status_code == 200, f"User login failed: {user_login_resp.text}"
        user_token = user_login_resp.json().get("token")
        assert user_token and isinstance(user_token, str)

        # Use non-admin token to get users - expect 403
        user_headers = {"Authorization": f"Bearer {user_token}"}
        get_users_user_resp = requests.get(users_url, headers=user_headers, timeout=TIMEOUT)
        assert get_users_user_resp.status_code == 403, (
            f"Non-admin GET /api/users expected 403, got {get_users_user_resp.status_code}"
        )
        error_text = get_users_user_resp.text.lower()
        # Optionally check error message includes admin access required
        assert "admin" in error_text or "access" in error_text or "forbidden" in error_text

    except requests.RequestException as e:
        assert False, f"HTTP request failed: {e}"


test_user_management_get_users_requires_admin_access()
