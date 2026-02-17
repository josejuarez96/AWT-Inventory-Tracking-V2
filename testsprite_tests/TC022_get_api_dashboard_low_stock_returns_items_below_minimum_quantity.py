import requests

BASE_URL = "http://localhost:3000"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
LOW_STOCK_URL = f"{BASE_URL}/api/dashboard/low-stock"
TIMEOUT = 30

def test_get_api_dashboard_low_stock_returns_items_below_min_quantity():
    # Step 1: Authenticate and get JWT token
    login_data = {
        "username": "jose",
        "password": "password123"
    }
    try:
        login_resp = requests.post(LOGIN_URL, json=login_data, timeout=TIMEOUT)
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        token = login_resp.json().get("token")
        assert token, "No token received in login response"
    except Exception as e:
        raise AssertionError(f"Authentication step failed: {e}")

    headers = {
        "Authorization": f"Bearer {token}"
    }

    # Step 2: GET /api/dashboard/low-stock with auth token
    try:
        resp = requests.get(LOW_STOCK_URL, headers=headers, timeout=TIMEOUT)
    except Exception as e:
        raise AssertionError(f"Request to low-stock API failed: {e}")

    # Step 3: Validate response status code
    assert resp.status_code == 200, f"Expected status 200 but got {resp.status_code}: {resp.text}"

    # Step 4: Validate response schema
    data = resp.json()
    assert "items" in data, "'items' key missing in response"

    items = data["items"]
    assert isinstance(items, list), "'items' is not a list"

    # Step 5: Validate each item fields and types
    for idx, item in enumerate(items):
        # id: present and number
        assert "id" in item, f"Item {idx} missing 'id'"
        assert isinstance(item["id"], int), f"Item {idx} 'id' is not int"

        # itemCode: present and string
        assert "itemCode" in item, f"Item {idx} missing 'itemCode'"
        assert isinstance(item["itemCode"], str), f"Item {idx} 'itemCode' is not string"

        # description: present and string
        assert "description" in item, f"Item {idx} missing 'description'"
        assert isinstance(item["description"], str), f"Item {idx} 'description' is not string"

        # currentStock: present and number (int or float)
        assert "currentStock" in item, f"Item {idx} missing 'currentStock'"
        assert isinstance(item["currentStock"], (int,float)), f"Item {idx} 'currentStock' is not number"

        # minQuantity: present and number (int or float)
        assert "minQuantity" in item, f"Item {idx} missing 'minQuantity'"
        assert isinstance(item["minQuantity"], (int,float)), f"Item {idx} 'minQuantity' is not number"

        # burnRate: present and number or null
        assert "burnRate" in item, f"Item {idx} missing 'burnRate'"
        burn_rate = item["burnRate"]
        assert (burn_rate is None) or isinstance(burn_rate, (int,float)), f"Item {idx} 'burnRate' not number or null"

        # daysRemaining: present and number or null
        assert "daysRemaining" in item, f"Item {idx} missing 'daysRemaining'"
        days_remaining = item["daysRemaining"]
        assert (days_remaining is None) or isinstance(days_remaining, (int,float)), f"Item {idx} 'daysRemaining' not number or null"

test_get_api_dashboard_low_stock_returns_items_below_min_quantity()