import requests
import random
import string

BASE_URL = "http://localhost:3000"

def login(username: str, password: str):
    url = f"{BASE_URL}/api/auth/login"
    resp = requests.post(url, json={"username": username, "password": password}, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    token = data["token"]
    user = data["user"]
    return token, user

def create_user(token: str, user_data: dict):
    url = f"{BASE_URL}/api/users"
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.post(url, json=user_data, headers=headers, timeout=30)
    return resp

def delete_user(token: str, user_id: int):
    url = f"{BASE_URL}/api/users/{user_id}/status"
    headers = {"Authorization": f"Bearer {token}"}
    # Setting isActive to false to deactivate (logical delete)
    resp = requests.patch(url, json={"isActive": False}, headers=headers, timeout=30)
    resp.raise_for_status()

def test_user_management_create_user_with_admin_authorization():
    # Step 1: Login as admin to get token
    admin_token, admin_user = login("jose", "password123")
    
    # Step 2: Login as standard user to get token for non-admin test
    non_admin_token, _ = login("alix", "password123")

    # Generate a random suffix to create a unique username to avoid conflicts
    random_suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
    new_username = f"testuser_{random_suffix}"
    user_payload = {
        "username": new_username,
        "password": "TestPass123!",
        "fullName": "Test User",
        "role": "user"
    }
    
    created_user_id = None

    try:
        # Test: valid admin token creates user successfully
        resp = create_user(admin_token, user_payload)
        assert resp.status_code == 201, f"Expected 201, got {resp.status_code}"
        data = resp.json()
        user = data["user"]
        created_user_id = user["id"]
        assert user["username"] == new_username
        assert user["fullName"] == "Test User"
        assert user["role"] == "user"
        assert "isActive" in user
        assert "createdAt" in user
        assert "lastLoginAt" in user or user["lastLoginAt"] is None

        # Test: duplicate username should get 409 conflict
        resp_dup = create_user(admin_token, user_payload)
        assert resp_dup.status_code == 409, f"Expected 409 on duplicate username, got {resp_dup.status_code}"
        data_dup = resp_dup.json()
        assert "Username already taken" in str(data_dup).lower() or resp_dup.text.lower().find("username") != -1
        
        # Test: non-admin token attempt to create user should get 403 forbidden
        user_data_forbidden = {
            "username": f"forbidden_{random_suffix}",
            "password": "TestPass123!",
            "fullName": "Forbidden User",
            "role": "user"
        }
        resp_forbidden = create_user(non_admin_token, user_data_forbidden)
        assert resp_forbidden.status_code == 403, f"Expected 403 for non-admin access, got {resp_forbidden.status_code}"
        data_forbidden = resp_forbidden.json()
        assert "admin access required" in str(data_forbidden).lower() or "forbidden" in resp_forbidden.reason.lower()
    
    finally:
        # Cleanup: deactivate/delete created user if created
        if created_user_id:
            try:
                delete_user(admin_token, created_user_id)
            except Exception:
                pass

test_user_management_create_user_with_admin_authorization()