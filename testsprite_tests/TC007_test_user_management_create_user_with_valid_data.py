import requests
import uuid

BASE_URL = "http://localhost:3000"
ADMIN_USERNAME = "jose"
ADMIN_PASSWORD = "Password1"
TIMEOUT = 30


def login(username: str, password: str) -> str:
    url = f"{BASE_URL}/api/auth/login"
    resp = requests.post(url, json={"username": username, "password": password}, timeout=TIMEOUT)
    resp.raise_for_status()
    return resp.json()["token"]


def create_user(token: str, user_data: dict):
    url = f"{BASE_URL}/api/users"
    headers = {"Authorization": f"Bearer {token}"}
    return requests.post(url, json=user_data, headers=headers, timeout=TIMEOUT)


def deactivate_user(token: str, user_id: int):
    url = f"{BASE_URL}/api/users/{user_id}/status"
    headers = {"Authorization": f"Bearer {token}"}
    body = {"isActive": False}
    return requests.patch(url, json=body, headers=headers, timeout=TIMEOUT)


def test_user_management_create_user_with_valid_data():
    admin_token = login(ADMIN_USERNAME, ADMIN_PASSWORD)

    # Generate unique username to avoid conflict
    unique_username = f"testuser_{uuid.uuid4().hex[:8]}"
    user_data = {
        "username": unique_username,
        "password": "ValidPass1",
        "fullName": "Test User",
        "role": "user"
    }

    # Create user - expected 201 Created
    response = create_user(admin_token, user_data)
    assert response.status_code == 201, f"Expected 201, got {response.status_code}"
    created_user = response.json().get("user")
    assert created_user is not None, "Response JSON missing 'user'"
    assert created_user["username"] == unique_username
    assert created_user["fullName"] == "Test User"
    assert created_user["role"] == "user"
    created_user_id = created_user["id"]

    try:
        # Attempt to create again with same username - expect 409 Conflict
        duplicate_response = create_user(admin_token, user_data)
        assert duplicate_response.status_code == 409, \
            f"Expected 409 for duplicate username, got {duplicate_response.status_code}"
        error_msg = duplicate_response.text.lower()
        assert "username" in error_msg and ("taken" in error_msg or "exists" in error_msg)
    finally:
        # Clean up by deactivating created user (soft delete)
        deactivate_resp = deactivate_user(admin_token, created_user_id)
        assert deactivate_resp.status_code == 200, f"Failed to deactivate user {created_user_id}"


test_user_management_create_user_with_valid_data()
