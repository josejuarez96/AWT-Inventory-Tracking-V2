import requests
import time

BASE_URL = "http://localhost:3002/api"
TIMEOUT = 30

def test_workflow_authentication_session_and_security():
    session = requests.Session()

    # Step 1: POST /api/auth/login with invalid credentials -> verify 401
    resp = session.post(
        f"{BASE_URL}/auth/login",
        json={"username": "nonexistent", "password": "wrong"},
        timeout=TIMEOUT
    )
    assert resp.status_code == 401

    time.sleep(2)

    # Step 2: POST /api/auth/login with valid admin (jose/Password1) -> verify 200 with token and user.role='admin'
    resp = session.post(
        f"{BASE_URL}/auth/login",
        json={"username": "jose", "password": "Password1"},
        timeout=TIMEOUT
    )
    assert resp.status_code == 200
    json_data = resp.json()
    assert "token" in json_data and "user" in json_data
    assert json_data["user"].get("role") == "admin"
    admin_token = json_data["token"]
    admin_user = json_data["user"]

    time.sleep(2)

    headers_admin = {"Authorization": f"Bearer {admin_token}"}

    # Step 3: GET /api/auth/me with the token -> verify 200 with matching user details
    resp = session.get(f"{BASE_URL}/auth/me", headers=headers_admin, timeout=TIMEOUT)
    assert resp.status_code == 200
    json_data = resp.json()
    user_data = json_data.get("user")
    assert user_data is not None
    assert user_data.get("id") == admin_user.get("id")
    assert user_data.get("username") == admin_user.get("username")
    assert user_data.get("role") == "admin"

    time.sleep(2)

    # Step 4: GET /api/auth/me with no Authorization header -> verify 401
    resp = session.get(f"{BASE_URL}/auth/me", timeout=TIMEOUT)
    assert resp.status_code == 401

    time.sleep(2)

    # Step 5: GET /api/auth/me with Authorization: Bearer invalidtoken123 -> verify 401
    resp = session.get(f"{BASE_URL}/auth/me", headers={"Authorization": "Bearer invalidtoken123"}, timeout=TIMEOUT)
    assert resp.status_code == 401

    time.sleep(2)

    # Step 6: POST /api/auth/logout with valid admin token -> verify 200
    resp = session.post(f"{BASE_URL}/auth/logout", headers=headers_admin, timeout=TIMEOUT)
    assert resp.status_code == 200
    logout_json = resp.json()
    assert "message" in logout_json and isinstance(logout_json["message"], str)

    time.sleep(2)

    # Step 7: POST /api/auth/login with user (alix/Password1) -> verify 200 with token and user.role='user'
    resp = session.post(
        f"{BASE_URL}/auth/login",
        json={"username": "alix", "password": "Password1"},
        timeout=TIMEOUT
    )
    assert resp.status_code == 200
    json_data = resp.json()
    assert "token" in json_data and "user" in json_data
    assert json_data["user"].get("role") == "user"
    user_token = json_data["token"]
    user_user = json_data["user"]

    time.sleep(2)

    headers_user = {"Authorization": f"Bearer {user_token}"}

    # Step 8: GET /api/auth/me -> verify returns alix's user object
    resp = session.get(f"{BASE_URL}/auth/me", headers=headers_user, timeout=TIMEOUT)
    assert resp.status_code == 200
    json_data = resp.json()
    user_data = json_data.get("user")
    assert user_data is not None
    assert user_data.get("id") == user_user.get("id")
    assert user_data.get("username") == user_user.get("username")
    assert user_data.get("role") == "user"

    time.sleep(2)

    # Step 9: Test endpoint without auth: GET /api/health -> verify 200 (public endpoint works without token)
    resp = session.get(f"{BASE_URL}/health", timeout=TIMEOUT)
    assert resp.status_code == 200
    json_data = resp.json()
    assert json_data.get("status") == "ok"
    assert "timestamp" in json_data and isinstance(json_data["timestamp"], str)
    assert "message" in json_data and isinstance(json_data["message"], str)

    time.sleep(2)

    # Step 10: GET /api/items without token -> verify 401 (protected endpoint blocks)
    resp = session.get(f"{BASE_URL}/items", timeout=TIMEOUT)
    assert resp.status_code == 401

test_workflow_authentication_session_and_security()