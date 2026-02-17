import requests
import random
import string

BASE_URL = "http://localhost:3000"
TIMEOUT = 30

def generate_random_string(length=8):
    return ''.join(random.choices(string.ascii_letters + string.digits, k=length))

def admin_login():
    url = f"{BASE_URL}/api/auth/login"
    credentials = {"username": "jose", "password": "password123"}
    resp = requests.post(url, json=credentials, timeout=TIMEOUT)
    resp.raise_for_status()
    assert resp.status_code == 200
    return resp.json()["token"]

def create_user(token, username, password="TestPass123!", fullName="Test User", role="user"):
    url = f"{BASE_URL}/api/users"
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "username": username,
        "password": password,
        "fullName": fullName,
        "role": role
    }
    resp = requests.post(url, json=payload, headers=headers, timeout=TIMEOUT)
    resp.raise_for_status()
    assert resp.status_code == 201
    data = resp.json()
    assert "user" in data, "Created user response missing 'user' envelope"
    user = data["user"]
    assert "id" in user, "Created user response missing 'id'"
    return user

def delete_user(token, user_id):
    if not user_id:
        return
    url = f"{BASE_URL}/api/users/{user_id}/status"
    headers = {"Authorization": f"Bearer {token}"}
    payload = {"isActive": False}
    # Attempt to deactivate user as delete is not defined in PRD; alternatively ignore if not allowed.
    try:
        requests.patch(url, json=payload, headers=headers, timeout=TIMEOUT)
    except:
        pass

def test_TC007_user_management_update_user_fields_optionally():
    token = admin_login()
    headers = {"Authorization": f"Bearer {token}"}
    random_suffix = generate_random_string()
    username = f"testupdateuser_{random_suffix}"
    # Create user to update
    user = create_user(token, username, password="InitPass123!", fullName="Initial Name", role="user")
    user_id = user.get("id")
    try:
        # Happy path: update fullName only
        update_payload = {"fullName": "Updated Name"}
        url = f"{BASE_URL}/api/users/{user_id}"
        resp = requests.put(url, json=update_payload, headers=headers, timeout=TIMEOUT)
        assert resp.status_code == 200
        updated_user = resp.json()["user"]
        assert updated_user["id"] == user_id
        assert updated_user["fullName"] == "Updated Name"
        assert "password" not in updated_user
        assert updated_user["role"] == user["role"]

        # Happy path: update role only
        update_payload = {"role": "admin"}
        resp = requests.put(url, json=update_payload, headers=headers, timeout=TIMEOUT)
        assert resp.status_code == 200
        updated_user = resp.json()["user"]
        assert updated_user["role"] == "admin"

        # Happy path: update password only
        update_payload = {"password": "NewPass456!"}
        resp = requests.put(url, json=update_payload, headers=headers, timeout=TIMEOUT)
        assert resp.status_code == 200
        updated_user = resp.json()["user"]
        assert updated_user["id"] == user_id

        # Happy path: update all fields
        update_payload = {"fullName": "Final Name", "role": "user", "password": "FinalPass789!"}
        resp = requests.put(url, json=update_payload, headers=headers, timeout=TIMEOUT)
        assert resp.status_code == 200
        updated_user = resp.json()["user"]
        assert updated_user["fullName"] == "Final Name"
        assert updated_user["role"] == "user"

        # Error case: no fields provided (empty body)
        resp = requests.put(url, json={}, headers=headers, timeout=TIMEOUT)
        assert resp.status_code == 400

        # Error case: invalid user ID (non-existing)
        bad_url = f"{BASE_URL}/api/users/99999999"
        update_payload = {"fullName": "Name"}
        resp = requests.put(bad_url, json=update_payload, headers=headers, timeout=TIMEOUT)
        assert resp.status_code == 404

        # Error case: invalid user ID (malformed)
        bad_url = f"{BASE_URL}/api/users/invalid-id"
        resp = requests.put(bad_url, json=update_payload, headers=headers, timeout=TIMEOUT)
        assert resp.status_code in (400,404)
    finally:
        # Clean up: deactivate the created user to avoid side effects
        if user_id:
            delete_user(token, user_id)

test_TC007_user_management_update_user_fields_optionally()