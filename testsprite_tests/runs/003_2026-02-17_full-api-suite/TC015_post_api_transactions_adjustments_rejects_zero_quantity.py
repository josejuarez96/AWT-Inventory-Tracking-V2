import requests

BASE_URL = "http://localhost:3000"
TIMEOUT = 30

def test_post_api_transactions_adjustments_rejects_zero_quantity():
    login_url = f"{BASE_URL}/api/auth/login"
    items_url = f"{BASE_URL}/api/items"
    adjustments_url = f"{BASE_URL}/api/transactions/adjustments"
    
    # Step 1: Authenticate and get token
    auth_payload = {"username": "jose", "password": "password123"}
    try:
        login_resp = requests.post(login_url, json=auth_payload, timeout=TIMEOUT)
        login_resp.raise_for_status()
        token = login_resp.json().get("token")
        assert token and isinstance(token, str), "Token missing or invalid"
    except Exception as e:
        assert False, f"Login failed: {e}"
    
    headers = {"Authorization": f"Bearer {token}"}

    # Step 2: Get valid itemId (first item from /api/items)
    try:
        items_resp = requests.get(items_url, headers=headers, timeout=TIMEOUT)
        items_resp.raise_for_status()
        items_data = items_resp.json()
        items_list = items_data.get("items")
        assert items_list and isinstance(items_list, list), "No items found"
        valid_item_id = items_list[0].get("id")
        assert isinstance(valid_item_id, int), "Invalid item id"
    except Exception as e:
        assert False, f"Failed to get valid itemId: {e}"

    # Step 3: POST to /api/transactions/adjustments with quantity = 0
    adjustment_payload = {
        "itemId": valid_item_id,
        "location": "ADEL",
        "quantity": 0,
        "reason": "Correction"
    }
    try:
        adjustment_resp = requests.post(adjustments_url, headers=headers, json=adjustment_payload, timeout=TIMEOUT)
    except Exception as e:
        assert False, f"Request to adjustments endpoint failed: {e}"
    
    # Assert that the response status code is 400 for validation error
    assert adjustment_resp.status_code == 400, f"Expected 400 status code, got {adjustment_resp.status_code}"

    # Optionally validate the error content structure (validation error array)
    try:
        error_content = adjustment_resp.json()
        assert isinstance(error_content, (dict, list)), "Error response is not json object or list"
        # Could check presence of 'quantity' field error if format known but not specified in PRD
    except Exception:
        assert False, "Response is not valid JSON for error response"

test_post_api_transactions_adjustments_rejects_zero_quantity()