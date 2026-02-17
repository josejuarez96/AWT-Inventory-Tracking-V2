import requests
from requests.exceptions import RequestException
from datetime import datetime

BASE_URL = "http://localhost:3002"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
STOCK_POSITION_URL = f"{BASE_URL}/api/transactions/stock-position"

ADMIN_USERNAME = "jose"
ADMIN_PASSWORD = "Password1"

def test_get_api_transactions_stock_position_returns_paginated_inventory():
    timeout = 30
    # Authenticate as standard user 'alix' per instructions (valid authorization)
    auth_payload = {
        "username": "alix",
        "password": "Password1"
    }
    try:
        login_resp = requests.post(LOGIN_URL, json=auth_payload, timeout=timeout)
        assert login_resp.status_code == 200, f"Login failed: {login_resp.status_code} {login_resp.text}"
        login_data = login_resp.json()
        token = login_data.get("token")
        assert token, "JWT token not found in login response"

        headers = {
            "Authorization": f"Bearer {token}"
        }
        params = {
            "page": 1,
            "limit": 50
        }
        resp = requests.get(STOCK_POSITION_URL, headers=headers, params=params, timeout=timeout)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}, response: {resp.text}"

        data = resp.json()
        # Validate presence and types of pagination fields
        assert isinstance(data.get("positions"), list), "positions must be a list"
        assert isinstance(data.get("total"), int), "total must be int"
        assert isinstance(data.get("page"), int), "page must be int"
        assert isinstance(data.get("limit"), int), "limit must be int"
        assert isinstance(data.get("totalPages"), int), "totalPages must be int"

        # Validate at least one position has required fields
        if data["positions"]:
            pos = data["positions"][0]
            required_fields = ["item", "adelQty", "calhounQty", "totalQty", "avgCost", "totalValue"]
            for field in required_fields:
                assert field in pos, f"Field '{field}' missing in position record"
            # item should be dict with details like id, itemCode, description typically
            assert isinstance(pos["item"], dict), "'item' field must be an object"
            # Quantities and costs should be numbers (int or float)
            for qty_field in ["adelQty", "calhounQty", "totalQty"]:
                assert isinstance(pos[qty_field], (int, float)), f"Field '{qty_field}' must be numeric"
            for cost_field in ["avgCost", "totalValue"]:
                assert isinstance(pos[cost_field], (int, float)), f"Field '{cost_field}' must be numeric"
        
    except RequestException as e:
        assert False, f"Request to API failed: {e}"

test_get_api_transactions_stock_position_returns_paginated_inventory()