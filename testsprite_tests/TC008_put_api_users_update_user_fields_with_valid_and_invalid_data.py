import requests
import uuid

BASE_URL = "http://localhost:3000"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
USERS_URL = f"{BASE_URL}/api/users"
TIMEOUT = 30

ADMIN_CREDENTIALS = {"username": "jose", "password": "password123"}

def get_admin_token():
    resp = requests.post(
        LOGIN_URL,
        json=ADMIN_CREDENTIALS,
        timeout=TIMEOUT
    )
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    data = resp.json()
    token = data.get("token")
    assert token, "No token in login response"
    return token

def create_user(token, username=None, password="TestPass1X", fullName="Test User", role="user"):
    if username is None:
        username = f"testuser_{uuid.uuid4().hex[:8]}"
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
    return resp

def delete_user(token, user_id):
    # Soft delete: Deactivate user (PATCH /api/users/:id/status with isActive: false)
    headers = {"Authorization": f"Bearer {token}"}
    url = f"{USERS_URL}/{user_id}/status"
    payload = {"isActive": False}
    resp = requests.patch(url, json=payload, headers=headers, timeout=TIMEOUT)
    # Ignore errors during cleanup
    return resp

def test_put_api_users_update_user_fields():
    token = get_admin_token()
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # Create user to update
    create_resp = create_user(token)
    assert create_resp.status_code == 201, f"User creation failed: {create_resp.text}"
    user = create_resp.json().get("user")
    assert user and "id" in user, "User id missing in creation response"
    user_id = user["id"]

    try:
        # Test valid update: fullName and role
        update_payload = {
            "fullName": "Updated FullName",
            "role": "admin"
        }
        resp = requests.put(
            f"{USERS_URL}/{user_id}",
            json=update_payload,
            headers=headers,
            timeout=TIMEOUT
        )
        assert resp.status_code == 200, f"Valid update failed: {resp.text}"
        updated_user = resp.json().get("user")
        assert updated_user, "Missing user in update response"
        assert updated_user.get("fullName") == "Updated FullName", "fullName not updated"
        assert updated_user.get("role") == "admin", "role not updated"
        assert updated_user.get("id") == user_id, "Returned user id mismatch"

        # Test valid update: password reset with a strong password
        update_payload_pw = {
            "password": "ResetPass1"
        }
        resp_pw = requests.put(
            f"{USERS_URL}/{user_id}",
            json=update_payload_pw,
            headers=headers,
            timeout=TIMEOUT
        )
        assert resp_pw.status_code == 200, f"Password reset with valid password failed: {resp_pw.text}"
        updated_pw_user = resp_pw.json().get("user")
        assert updated_pw_user and updated_pw_user.get("id") == user_id, "Password reset user id mismatch"

        # Test invalid update: password reset with a weak password
        weak_pw_payload = {"password": "weak"}
        resp_weak = requests.put(
            f"{USERS_URL}/{user_id}",
            json=weak_pw_payload,
            headers=headers,
            timeout=TIMEOUT
        )
        assert resp_weak.status_code == 400, f"Weak password should fail with 400 but got {resp_weak.status_code}"

        # Test invalid update: no fields to update (empty body)
        resp_empty = requests.put(
            f"{USERS_URL}/{user_id}",
            json={},
            headers=headers,
            timeout=TIMEOUT
        )
        # According to API, should return 400 for no fields to update
        assert resp_empty.status_code == 400, f"Empty update should fail with 400 but got {resp_empty.status_code}"

        # Test invalid update: non-existent user id
        non_exist_id = 999999999
        payload_non_exist = {"fullName": "Non Exist User"}
        resp_404 = requests.put(
            f"{USERS_URL}/{non_exist_id}",
            json=payload_non_exist,
            headers=headers,
            timeout=TIMEOUT
        )
        assert resp_404.status_code == 404, f"Update non-existent user should fail 404 but got {resp_404.status_code}"

        # Test invalid update: invalid role value (not admin or user)
        invalid_role_payload = {"role": "superadmin"}
        resp_bad_role = requests.put(
            f"{USERS_URL}/{user_id}",
            json=invalid_role_payload,
            headers=headers,
            timeout=TIMEOUT
        )
        # The API docs don't explicitly say about invalid roles, but likely 400 validation error
        assert resp_bad_role.status_code == 400, f"Invalid role update should fail 400 but got {resp_bad_role.status_code}"

    finally:
        # Cleanup: deactivate test user
        delete_user(token, user_id)

test_put_api_users_update_user_fields()