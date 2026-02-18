import requests
import uuid

BASE_URL = "http://localhost:3000"
TIMEOUT = 30

def test_put_api_users_id_updates_user_details():
    # Step 1: Login as admin to get token
    login_payload = {"username": "admin", "password": "admin123"}
    resp = requests.post(f"{BASE_URL}/api/auth/login", json=login_payload, timeout=TIMEOUT)
    assert resp.status_code == 200, f"Admin login failed: {resp.text}"
    token = resp.json().get("token")
    assert token, "No token received on admin login"

    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # Step 2: Create a new user to update (for testing)
    unique_username = f"testuser_{uuid.uuid4().hex[:8]}"
    new_user_payload = {
        "username": unique_username,
        "password": "TestPass123!",
        "fullName": "Test User",
        "role": "user"
    }
    create_resp = requests.post(f"{BASE_URL}/api/users", headers=headers, json=new_user_payload, timeout=TIMEOUT)
    assert create_resp.status_code == 201, f"User creation failed: {create_resp.text}"
    created_user = create_resp.json().get("user")
    assert created_user and "id" in created_user, "Created user missing in response"
    user_id = created_user["id"]

    try:
        # Step 3: PUT with valid update fields
        update_payload = {
            "fullName": "Updated Test User",
            "role": "admin",
            "password": "NewPass456!"
        }
        update_resp = requests.put(f"{BASE_URL}/api/users/{user_id}", headers=headers, json=update_payload, timeout=TIMEOUT)
        assert update_resp.status_code == 200, f"Valid update failed: {update_resp.text}"
        updated_user = update_resp.json().get("user")
        assert updated_user, "Response missing 'user' key after update"
        assert updated_user["id"] == user_id, "Updated user ID mismatch"
        assert updated_user["fullName"] == update_payload["fullName"], "FullName not updated correctly"
        assert updated_user["role"] == update_payload["role"], "Role not updated correctly"
        assert "username" in updated_user and updated_user["username"] == unique_username, "Username should be unchanged"

        # Step 4: PUT with empty body (should get 400)
        empty_body_resp = requests.put(f"{BASE_URL}/api/users/{user_id}", headers=headers, json={}, timeout=TIMEOUT)
        assert empty_body_resp.status_code == 400, f"Empty body update should fail with 400 but got {empty_body_resp.status_code}"

        # Step 5: PUT with invalid data (invalid role)
        invalid_payload = {
            "role": "superadmin"  # invalid role not allowed
        }
        invalid_resp = requests.put(f"{BASE_URL}/api/users/{user_id}", headers=headers, json=invalid_payload, timeout=TIMEOUT)
        assert invalid_resp.status_code == 400, f"Invalid data update should fail with 400 but got {invalid_resp.status_code}"

    finally:
        # Cleanup: deactivate the created user (soft-delete since no delete endpoint)
        deactivate_payload = {"isActive": False}
        # Use PATCH /api/users/:id/status per known API (not PUT)
        requests.patch(f"{BASE_URL}/api/users/{user_id}/status", headers=headers, json=deactivate_payload, timeout=TIMEOUT)

test_put_api_users_id_updates_user_details()