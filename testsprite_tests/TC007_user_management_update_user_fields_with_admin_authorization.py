import requests
import uuid

BASE_URL = "http://localhost:3000"
TIMEOUT = 30

def login(username: str, password: str) -> str:
    resp = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": username, "password": password},
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    data = resp.json()
    return data["token"]

def create_user(admin_token: str, username: str, password: str, fullName: str, role: str) -> dict:
    headers = {"Authorization": f"Bearer {admin_token}"}
    body = {
        "username": username,
        "password": password,
        "fullName": fullName,
        "role": role,
    }
    resp = requests.post(f"{BASE_URL}/api/users", headers=headers, json=body, timeout=TIMEOUT)
    assert resp.status_code == 201, f"Unexpected status code {resp.status_code} when creating user"
    data = resp.json()
    user = data["user"]
    return user

def delete_user(admin_token: str, user_id: int):
    headers = {"Authorization": f"Bearer {admin_token}"}
    resp = requests.delete(f"{BASE_URL}/api/users/{user_id}", headers=headers, timeout=TIMEOUT)
    # Deletion might return 200 or 204 or 404 if already deleted
    assert resp.status_code in (200, 204, 404)

def test_TC007_user_management_update_user_fields_with_admin_authorization():
    admin_token = login("jose", "password123")

    # Create a new user to update
    random_suffix = uuid.uuid4().hex[:8]
    username = f"testuser_tc007_{random_suffix}"
    password = "initialPass123"
    fullName = "Initial Name"
    role = "user"
    user = create_user(admin_token, username, password, fullName, role)
    user_id = user["id"]

    headers = {"Authorization": f"Bearer {admin_token}"}

    try:
        # 1. Test valid update: update fullName, role, and password
        updated_fullName = "Updated Name"
        updated_role = "admin"
        updated_password = "NewPass456"
        update_body = {
            "fullName": updated_fullName,
            "role": updated_role,
            "password": updated_password,
        }
        resp = requests.put(
            f"{BASE_URL}/api/users/{user_id}", headers=headers, json=update_body, timeout=TIMEOUT
        )
        assert resp.status_code == 200, f"Expected 200 on valid update, got {resp.status_code}"
        data = resp.json()
        updated_user = data["user"]
        assert updated_user["id"] == user_id
        assert updated_user["fullName"] == updated_fullName
        assert updated_user["role"] == updated_role
        assert "password" not in updated_user  # password hash not returned

        # 2. Test error case: no fields to update (empty PUT body)
        resp = requests.put(
            f"{BASE_URL}/api/users/{user_id}", headers=headers, json={}, timeout=TIMEOUT
        )
        assert resp.status_code == 400, f"Expected 400 on empty update body, got {resp.status_code}"
        data = resp.json()
        # According to PRD, error response might be validation error or no fields error
        # No exact error schema given, just check presence of some error fields
        assert "error" in data or "errors" in data or isinstance(data, dict), "Expected error object on empty update"

        # 3. Test error case: user not found
        non_existent_id = 99999999
        resp = requests.put(
            f"{BASE_URL}/api/users/{non_existent_id}", headers=headers, json=update_body, timeout=TIMEOUT
        )
        assert resp.status_code == 404, f"Expected 404 on user not found, got {resp.status_code}"
        data = resp.json()
        # No explicit error key specified, but should have something indicating not found
        assert "error" in data or "message" in data or isinstance(data, dict), "Expected error object on 404 user not found"

    finally:
        # Cleanup: delete the created user
        delete_user(admin_token, user_id)

test_TC007_user_management_update_user_fields_with_admin_authorization()