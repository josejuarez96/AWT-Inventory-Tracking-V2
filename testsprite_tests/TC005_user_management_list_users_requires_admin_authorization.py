import requests

BASE_URL = "http://localhost:3000"
TIMEOUT = 30

def login(username, password):
    url = f"{BASE_URL}/api/auth/login"
    payload = {"username": username, "password": password}
    resp = requests.post(url, json=payload, timeout=TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    token = data["token"]
    user = data["user"]
    return token, user

def test_user_management_list_users_requires_admin_authorization():
    admin_token, admin_user = login("jose", "password123")
    user_token, user_user = login("alix", "password123")

    headers_admin = {"Authorization": f"Bearer {admin_token}"}
    headers_user = {"Authorization": f"Bearer {user_token}"}

    # Test with admin token - expect 200 and users list without password hashes
    resp_admin = requests.get(f"{BASE_URL}/api/users", headers=headers_admin, timeout=TIMEOUT)
    assert resp_admin.status_code == 200, f"Expected 200 for admin list users, got {resp_admin.status_code}"
    data_admin = resp_admin.json()
    assert "users" in data_admin, "Response JSON missing 'users' key"
    assert isinstance(data_admin["users"], list), "'users' should be a list"
    # Validate each user does NOT have password hash key
    for user_obj in data_admin["users"]:
        assert "password" not in user_obj, "User object should not contain password hash"
        # Validate required keys in user object
        for key in ["id", "username", "fullName", "role", "isActive", "createdAt", "lastLoginAt"]:
            assert key in user_obj, f"User object missing expected key: {key}"

    # Test with no token - expect 401 Unauthorized
    resp_no_auth = requests.get(f"{BASE_URL}/api/users", timeout=TIMEOUT)
    assert resp_no_auth.status_code == 401, f"Expected 401 Unauthorized with no token, got {resp_no_auth.status_code}"

    # Test with non-admin token - expect 403 Admin access required
    resp_user = requests.get(f"{BASE_URL}/api/users", headers=headers_user, timeout=TIMEOUT)
    assert resp_user.status_code in (401, 403), f"Expected 401 or 403 for non-admin user, got {resp_user.status_code}"

test_user_management_list_users_requires_admin_authorization()