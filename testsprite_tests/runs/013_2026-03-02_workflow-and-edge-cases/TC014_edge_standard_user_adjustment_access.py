import requests
import time

BASE_URL = "http://localhost:3002/api"
TIMEOUT = 30


def test_edge_standard_user_adjustment_access():
    session = requests.Session()

    # Step 1: Login as standard user (alix/Password1)
    login_url = f"{BASE_URL}/auth/login"
    login_payload = {"username": "alix", "password": "Password1"}
    login_resp = session.post(login_url, json=login_payload, timeout=TIMEOUT)
    assert login_resp.status_code == 200, "Login failed for standard user"
    token = login_resp.json().get("token")
    assert token and isinstance(token, str), "No token received on login"
    headers = {"Authorization": f"Bearer {token}"}

    # Step 2: GET /api/items to get a valid itemId
    items_url = f"{BASE_URL}/items"
    items_resp = session.get(items_url, headers=headers, timeout=TIMEOUT)
    assert items_resp.status_code == 200, "Failed to get items list"
    items_data = items_resp.json()
    items = items_data.get("items")
    assert items and isinstance(items, list) and len(items) > 0, "No items found in items list"
    item_id = items[0].get("id")
    assert isinstance(item_id, int), "Invalid item id retrieved"

    time.sleep(2)  # Wait 2 seconds as per instructions

    # Step 3: POST /api/transactions/adjustments with adjustment payload
    adjustments_url = f"{BASE_URL}/transactions/adjustments"
    adjustment_payload = {
        "itemId": item_id,
        "location": "ADEL",
        "quantity": 1,
        "reason": "Correction",
        "notes": "Edge case test"
    }
    adjustment_resp = session.post(adjustments_url, headers=headers, json=adjustment_payload, timeout=TIMEOUT)
    status_code = adjustment_resp.status_code

    # Step 4: Log the response body to document current behavior
    response_body = adjustment_resp.json() if adjustment_resp.headers.get("Content-Type", "").startswith("application/json") else adjustment_resp.text

    # Expected behavior comments:
    # If status code is 201, standard users CAN create adjustments (expected)
    # If 403, adjustments are admin-only (document as finding)
    # Use assertions matching the actual behavior observed
    assert status_code in (201, 403), f"Unexpected status code {status_code} for adjustment creation"

    print(f"Adjustment creation status code: {status_code}")
    print("Response body:")
    print(response_body)


test_edge_standard_user_adjustment_access()