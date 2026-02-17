import requests

BASE_URL = "http://localhost:3000"
LOGIN_ENDPOINT = "/api/auth/login"
STOCK_POSITION_ENDPOINT = "/api/transactions/stock-position"
TIMEOUT = 30

def test_get_api_transactions_stock_position_returns_aggregated_quantities_and_valuation():
    # Step 1: Authenticate and get JWT token
    login_url = BASE_URL + LOGIN_ENDPOINT
    login_payload = {"username": "jose", "password": "password123"}
    login_headers = {"Content-Type": "application/json"}

    try:
        login_resp = requests.post(login_url, json=login_payload, headers=login_headers, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Login request failed: {e}"
    assert login_resp.status_code == 200, f"Login failed with status {login_resp.status_code}"
    login_data = login_resp.json()
    assert "token" in login_data and isinstance(login_data["token"], str), "Token missing or invalid in login response"
    token = login_data["token"]

    # Step 2: GET stock-position using the token
    stock_position_url = BASE_URL + STOCK_POSITION_ENDPOINT
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json"
    }

    try:
        resp = requests.get(stock_position_url, headers=headers, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"GET {STOCK_POSITION_ENDPOINT} request failed: {e}"

    assert resp.status_code == 200, f"Expected status 200, got {resp.status_code}"
    try:
        data = resp.json()
    except Exception as e:
        assert False, f"Response is not valid JSON: {e}"

    assert "positions" in data, "'positions' key missing in response"
    positions = data["positions"]
    assert isinstance(positions, list), "'positions' is not a list"

    for pos in positions:
        # item object with id, itemCode, description
        assert "item" in pos, "Position missing 'item' key"
        item = pos["item"]
        assert isinstance(item, dict), "'item' is not an object"
        for key in ["id", "itemCode", "description"]:
            assert key in item, f"'item' missing '{key}'"
        assert isinstance(item["id"], int), "'item.id' is not int"
        assert isinstance(item["itemCode"], str), "'item.itemCode' is not str"
        assert isinstance(item["description"], str), "'item.description' is not str"

        # adelQty (number)
        assert "adelQty" in pos, "Position missing 'adelQty'"
        assert isinstance(pos["adelQty"], (int, float)), "'adelQty' is not a number"

        # calhounQty (number)
        assert "calhounQty" in pos, "Position missing 'calhounQty'"
        assert isinstance(pos["calhounQty"], (int, float)), "'calhounQty' is not a number"

        # totalQty (number)
        assert "totalQty" in pos, "Position missing 'totalQty'"
        assert isinstance(pos["totalQty"], (int, float)), "'totalQty' is not a number"

        # avgCost (number or null)
        assert "avgCost" in pos, "Position missing 'avgCost'"
        avg_cost = pos["avgCost"]
        assert (avg_cost is None) or isinstance(avg_cost, (int, float)), "'avgCost' is not number or null"

        # totalValue (number or null)
        assert "totalValue" in pos, "Position missing 'totalValue'"
        total_value = pos["totalValue"]
        assert (total_value is None) or isinstance(total_value, (int, float)), "'totalValue' is not number or null"

test_get_api_transactions_stock_position_returns_aggregated_quantities_and_valuation()