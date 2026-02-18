import requests

BASE_URL = "http://localhost:3000"
TIMEOUT = 30

def test_get_api_transactions_stock_position_returns_aggregated_quantities():
    # Step 1: Authenticate and get JWT token
    login_url = f"{BASE_URL}/api/auth/login"
    login_payload = {"username": "jose", "password": "password123"}
    try:
        login_resp = requests.post(login_url, json=login_payload, timeout=TIMEOUT)
        login_resp.raise_for_status()
    except requests.RequestException as e:
        assert False, f"Login request failed: {e}"
    login_data = login_resp.json()
    assert "token" in login_data, "Login response missing token"
    token = login_data["token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Step 2: Call GET /api/transactions/stock-position with auth token
    stock_pos_url = f"{BASE_URL}/api/transactions/stock-position"
    try:
        resp = requests.get(stock_pos_url, headers=headers, timeout=TIMEOUT)
        resp.raise_for_status()
    except requests.RequestException as e:
        assert False, f"GET /api/transactions/stock-position request failed: {e}"

    # Step 3: Validate response schema and content
    data = resp.json()
    assert isinstance(data, dict), "Response JSON should be an object"
    assert "positions" in data, "'positions' key missing in response"
    positions = data["positions"]
    assert isinstance(positions, list), "'positions' should be a list"

    # each position should be an object with keys: item (dict), adelQty, calhounQty, totalQty (numbers)
    for pos in positions:
        assert isinstance(pos, dict), "Position entry should be an object"
        assert "item" in pos, "Position missing 'item'"
        item = pos["item"]
        assert isinstance(item, dict), "'item' should be an object"
        # check mandatory keys inside item: id (number), itemCode (string), description (string),
        # category (string), unitOfMeasure (string), minQuantity (number)
        for key in ["id", "itemCode", "description", "category", "unitOfMeasure", "minQuantity"]:
            assert key in item, f"'item' missing key: {key}"
        assert isinstance(item["id"], int), "'item.id' should be int"
        assert isinstance(item["itemCode"], str), "'item.itemCode' should be str"
        assert isinstance(item["description"], str), "'item.description' should be str"
        assert isinstance(item["category"], str), "'item.category' should be str"
        assert isinstance(item["unitOfMeasure"], str), "'item.unitOfMeasure' should be str"
        assert isinstance(item["minQuantity"], (int, float)), "'item.minQuantity' should be number"

        # check quantities: adelQty, calhounQty, totalQty numeric
        for qty_key in ["adelQty", "calhounQty", "totalQty"]:
            assert qty_key in pos, f"Position missing quantity key: {qty_key}"
            qty_value = pos[qty_key]
            assert isinstance(qty_value, (int, float)), f"'{qty_key}' should be a number"

    # Step 4: Final assert for status code
    assert resp.status_code == 200, f"Expected status code 200, got {resp.status_code}"

test_get_api_transactions_stock_position_returns_aggregated_quantities()