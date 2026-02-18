import requests
import time

BASE_URL = "http://localhost:3002"
TIMEOUT = 30


def login(username, password):
    url = f"{BASE_URL}/api/auth/login"
    payload = {"username": username, "password": password}
    resp = requests.post(url, json=payload, timeout=TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    token = data.get("token")
    assert token, "Login failed, no token returned"
    return token


def test_TC008_standard_user_cannot_create_or_modify_boms():
    # Login as standard user
    token = login("alix", "Password1")
    headers = {"Authorization": f"Bearer {token}"}

    # Wait 2 seconds for rate limiting tolerance
    time.sleep(2)

    # Prepare BOM data (adjusting keys to expected schema: code -> bomCode, components -> lines)
    bom_payload = {
        "bomCode": "TEST-BOM",
        "name": "Test BOM",
        "finishedGoodId": 1,
        "lines": [
            {
                "itemId": 1,
                "quantityPer": 1
            }
        ]
    }

    url = f"{BASE_URL}/api/boms"
    resp = requests.post(url, json=bom_payload, headers=headers, timeout=TIMEOUT)

    # Expect 403 Forbidden because standard user cannot create BOMs
    assert resp.status_code == 403, f"Expected 403 Forbidden but got {resp.status_code}"
    # Optionally check the response body for the message or error code if available
    # Example assert:
    # body = resp.json()
    # assert "forbidden" in body.get("message", "").lower()

    # No modification test part because description only states POST creation check


test_TC008_standard_user_cannot_create_or_modify_boms()