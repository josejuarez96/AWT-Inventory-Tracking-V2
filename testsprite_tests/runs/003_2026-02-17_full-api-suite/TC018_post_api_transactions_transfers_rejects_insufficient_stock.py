import requests

BASE_URL = "http://localhost:3000"
TIMEOUT = 30

def test_post_api_transactions_transfers_rejects_insufficient_stock():
    # Login as admin user jose to get JWT token
    login_url = f"{BASE_URL}/api/auth/login"
    login_payload = {"username": "jose", "password": "password123"}
    try:
        login_resp = requests.post(login_url, json=login_payload, timeout=TIMEOUT)
        login_resp.raise_for_status()
        token = login_resp.json().get("token")
        assert token, "No token returned from login"
    except requests.RequestException as e:
        assert False, f"Login request failed: {e}"

    headers = {"Authorization": f"Bearer {token}"}

    # Get valid itemId by calling GET /api/items
    items_url = f"{BASE_URL}/api/items"
    try:
        items_resp = requests.get(items_url, headers=headers, timeout=TIMEOUT)
        items_resp.raise_for_status()
        items_data = items_resp.json()
        assert "items" in items_data and len(items_data["items"]) > 0, "No items found"
        item_id = items_data["items"][0]["id"]
        assert isinstance(item_id, int), "Invalid item id"
    except requests.RequestException as e:
        assert False, f"Failed to get items: {e}"

    # Prepare transfer with excessive quantity to trigger insufficient stock error
    transfer_url = f"{BASE_URL}/api/transactions/transfers"
    transfer_payload = {
        "itemId": item_id,
        "fromLocation": "CALHOUN",
        "toLocation": "ADEL",
        "quantity": 999999
    }

    try:
        transfer_resp = requests.post(transfer_url, headers=headers, json=transfer_payload, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Transfer request failed: {e}"

    # Validate that response status code is 400
    assert transfer_resp.status_code == 400, f"Expected 400 error, got {transfer_resp.status_code}"

    # Validate error message about insufficient stock
    try:
        error_data = transfer_resp.json()
    except ValueError:
        assert False, "Response is not valid JSON"

    # Accept error on key "message" or response body string containing 'Insufficient stock'
    message = None
    if isinstance(error_data, dict):
        if "message" in error_data:
            message = error_data["message"]
        else:
            # Some APIs may return error string or inside 'error' key
            message = error_data.get("error") or error_data.get("errorMessage")

    assert message, f"No error message found in response: {error_data}"
    assert "Insufficient stock" in message or "insufficient stock" in message.lower(), f"Unexpected error message: {message}"

test_post_api_transactions_transfers_rejects_insufficient_stock()