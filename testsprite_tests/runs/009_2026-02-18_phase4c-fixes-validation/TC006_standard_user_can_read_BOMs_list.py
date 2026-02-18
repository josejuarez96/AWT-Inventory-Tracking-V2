import requests
import time

BASE_URL = "http://localhost:3002"
TIMEOUT = 30

def test_TC006_standard_user_can_read_boms_list():
    login_url = f"{BASE_URL}/api/auth/login"
    boms_url = f"{BASE_URL}/api/boms"

    # Login as standard user
    login_payload = {"username": "alix", "password": "Password1"}
    try:
        login_resp = requests.post(login_url, json=login_payload, timeout=TIMEOUT)
        assert login_resp.status_code == 200, f"Login failed, status code: {login_resp.status_code}"
        token = login_resp.json().get("token")
        assert token, "No auth token received after login"
    except requests.RequestException as e:
        assert False, f"Request exception during login: {e}"

    time.sleep(2)  # Respect rate limiter

    headers = {"Authorization": f"Bearer {token}"}
    try:
        boms_resp = requests.get(boms_url, headers=headers, timeout=TIMEOUT)
        assert boms_resp.status_code == 200, f"Expected 200 OK for BOM list, got {boms_resp.status_code}"

        json_data = boms_resp.json()
        assert "boms" in json_data, "'boms' key not in response JSON"
        assert isinstance(json_data["boms"], list), "'boms' should be a list"
    except requests.RequestException as e:
        assert False, f"Request exception during GET /api/boms: {e}"

test_TC006_standard_user_can_read_boms_list()