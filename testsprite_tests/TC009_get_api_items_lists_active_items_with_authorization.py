import requests

BASE_URL = "http://localhost:3000"
LOGIN_ENDPOINT = "/api/auth/login"
ITEMS_ENDPOINT = "/api/items"
TIMEOUT = 30

def test_get_api_items_lists_active_items_with_authorization():
    # Step 1: Authenticate and get JWT token
    login_url = f"{BASE_URL}{LOGIN_ENDPOINT}"
    auth_payload = {"username": "jose", "password": "password123"}
    try:
        login_resp = requests.post(login_url, json=auth_payload, timeout=TIMEOUT)
        assert login_resp.status_code == 200, f"Login failed with status {login_resp.status_code}"
        login_data = login_resp.json()
        token = login_data.get("token")
        assert token and isinstance(token, str), "Token missing or invalid in login response"
    except (requests.RequestException, AssertionError) as e:
        raise AssertionError(f"Authentication failed: {e}")
    
    # Step 2: Use token to call GET /api/items
    items_url = f"{BASE_URL}{ITEMS_ENDPOINT}"
    headers = {"Authorization": f"Bearer {token}"}
    try:
        items_resp = requests.get(items_url, headers=headers, timeout=TIMEOUT)
        assert items_resp.status_code == 200, f"GET /api/items failed with status {items_resp.status_code}"
        items_data = items_resp.json()
        items = items_data.get("items")
        assert isinstance(items, list), "'items' key is missing or not a list"
        # Validate each item object has required keys with proper types and non-empty string values
        for item in items:
            assert isinstance(item, dict), "Item is not an object"
            for key in ["itemCode", "description", "category", "unitOfMeasure"]:
                assert key in item, f"Missing key '{key}' in item"
                val = item[key]
                assert isinstance(val, str) and val.strip() != "", f"Invalid or empty '{key}' in item"
    except (requests.RequestException, AssertionError) as e:
        raise AssertionError(f"GET /api/items validation failed: {e}")

test_get_api_items_lists_active_items_with_authorization()