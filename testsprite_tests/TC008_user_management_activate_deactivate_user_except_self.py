import requests
import random
import string

BASE_URL = "http://localhost:3000"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
USERS_URL = f"{BASE_URL}/api/users"
TIMEOUT = 30

def login(username: str, password: str) -> dict:
    resp = requests.post(
        LOGIN_URL,
        json={"username": username, "password": password},
        timeout=TIMEOUT
    )
    resp.raise_for_status()
    return resp.json()

def create_user(token: str, username: str, password: str, fullName: str, role: str) -> dict:
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "username": username,
        "password": password,
        "fullName": fullName,
        "role": role
    }
    resp = requests.post(
        USERS_URL,
        json=payload,
        headers=headers,
        timeout=TIMEOUT
    )
    resp.raise_for_status()
    return resp.json()

def patch_user_status(token: str, user_id: int, is_active: bool) -> requests.Response:
    headers = {"Authorization": f"Bearer {token}"}
    url = f"{USERS_URL}/{user_id}/status"
    resp = requests.patch(
        url,
        json={"isActive": is_active},
        headers=headers,
        timeout=TIMEOUT
    )
    return resp

def delete_user(token: str, user_id: int) -> None:
    headers = {"Authorization": f"Bearer {token}"}
    url = f"{USERS_URL}/{user_id}"
    requests.delete(url, headers=headers, timeout=TIMEOUT)

def random_suffix(length=6):
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=length))

def test_TC008_user_management_activate_deactivate_user_except_self():
    # Admin login
    admin_login_resp = login("jose", "password123")
    admin_token = admin_login_resp["token"]
    admin_user = admin_login_resp["user"]
    admin_user_id = admin_user["id"]

    # Create a new user to test activation/deactivation
    test_username = f"user_{random_suffix()}"
    test_password = "TestPass123!"
    test_fullName = "Test User"
    test_role = "user"
    created_user = None

    try:
        created_resp = create_user(
            admin_token,
            username=test_username,
            password=test_password,
            fullName=test_fullName,
            role=test_role
        )
        assert isinstance(created_resp, dict), f"Expected dict response, got {type(created_resp)}"
        assert "user" in created_resp, f"Created user response missing 'user' key: {created_resp}"
        created_user = created_resp["user"]
        assert "id" in created_user, f"Created user object missing 'id' field: {created_user}"
        test_user_id = created_user["id"]

        # 1) Successfully deactivate created user - should return 200 and user object
        resp_deactivate = patch_user_status(admin_token, test_user_id, False)
        assert resp_deactivate.status_code == 200, f"Expected 200, got {resp_deactivate.status_code}"
        resp_json = resp_deactivate.json()["user"]
        assert "id" in resp_json and resp_json["id"] == test_user_id
        assert "isActive" in resp_json and resp_json["isActive"] is False

        # Reactivate user to confirm activation works too
        resp_activate = patch_user_status(admin_token, test_user_id, True)
        assert resp_activate.status_code == 200, f"Expected 200, got {resp_activate.status_code}"
        resp_json = resp_activate.json()["user"]
        assert "id" in resp_json and resp_json["id"] == test_user_id
        assert "isActive" in resp_json and resp_json["isActive"] is True

        # 2) Attempt to deactivate own admin user account - expect 400 error
        resp_self_deactivate = patch_user_status(admin_token, admin_user_id, False)
        assert resp_self_deactivate.status_code == 400, f"Expected 400, got {resp_self_deactivate.status_code}"
        error_json = resp_self_deactivate.json()
        # The error message should indicate cannot deactivate own account
        error_str = str(error_json).lower()
        assert "cannot deactivate own account" in error_str

    finally:
        # Cleanup: delete the created user if it exists
        if created_user is not None:
            # Note: Assuming delete user endpoint exists and requires admin token, silently ignore errors
            try:
                delete_user(admin_token, created_user["id"])
            except Exception:
                pass

test_TC008_user_management_activate_deactivate_user_except_self()
