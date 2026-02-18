import requests

BASE_URL = "http://localhost:3000"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
ITEMS_URL = f"{BASE_URL}/api/items"
TRANSFERS_URL = f"{BASE_URL}/api/transactions/transfers"


def test_post_api_transactions_transfers_rejects_same_from_to_location():
    session = requests.Session()
    timeout = 30

    # Authenticate and get token
    login_payload = {"username": "jose", "password": "password123"}
    login_resp = session.post(LOGIN_URL, json=login_payload, timeout=timeout)
    assert login_resp.status_code == 200, f"Login failed with status {login_resp.status_code}"
    token = login_resp.json().get("token")
    assert token, "No token in login response"

    headers = {"Authorization": f"Bearer {token}"}

    # Get a valid itemId from /api/items
    items_resp = session.get(ITEMS_URL, headers=headers, timeout=timeout)
    assert items_resp.status_code == 200, f"Failed to get items, status {items_resp.status_code}"
    items_data = items_resp.json()
    assert "items" in items_data and isinstance(items_data["items"], list), "Invalid items response structure"
    assert len(items_data["items"]) > 0, "No items returned from /api/items"
    item_id = items_data["items"][0].get("id")
    assert item_id is not None, "First item has no id"

    # Prepare transfer payload with same fromLocation and toLocation
    transfer_payload = {
        "itemId": item_id,
        "fromLocation": "ADEL",
        "toLocation": "ADEL",
        "quantity": 5
    }

    # Perform POST /api/transactions/transfers expecting 400 error
    transfer_resp = session.post(TRANSFERS_URL, json=transfer_payload, headers=headers, timeout=timeout)
    assert transfer_resp.status_code == 400, f"Expected 400 error but got {transfer_resp.status_code}"

    # Check error message contains from/to location must be different
    try:
        resp_json = transfer_resp.json()
    except Exception:
        resp_json = None

    error_message = ""
    if resp_json:
        # The error message can be a string or inside an error key or array
        if isinstance(resp_json, dict):
            if "message" in resp_json:
                error_message = resp_json["message"]
            elif "error" in resp_json:
                error_message = resp_json["error"]
            else:
                # Check for validation error array
                for val in resp_json.values():
                    if isinstance(val, list):
                        for entry in val:
                            if isinstance(entry, str) and "from/to locations must differ" in entry.lower():
                                error_message = entry
                                break
    # Assert error message mentions from and to locations must be different
    assert ("from and to locations must be different" in error_message.lower()
            or "from/to locations must differ" in error_message.lower()
            or "from location must differ from to location" in error_message.lower()
            ), f"Error message did not mention different from/to locations: '{error_message}'"


test_post_api_transactions_transfers_rejects_same_from_to_location()