import requests

BASE_URL = "http://localhost:3000"
LOGIN_PATH = "/api/auth/login"
ITEMS_PATH = "/api/items"
OPENING_BALANCES_PATH = "/api/transactions/opening-balances"
TIMEOUT = 30

def test_post_api_transactions_opening_balances_creates_opening_balance_with_admin_token():
    # Step 1: Login to get admin token
    login_url = BASE_URL + LOGIN_PATH
    login_payload = {"username": "jose", "password": "password123"}
    try:
        login_resp = requests.post(login_url, json=login_payload, timeout=TIMEOUT)
        login_resp.raise_for_status()
    except requests.RequestException as e:
        assert False, f"Login request failed: {e}"
    login_data = login_resp.json()
    token = login_data.get("token")
    assert token, "Login response did not contain token"
    headers = {"Authorization": f"Bearer {token}"}

    # Step 2: Get valid itemId from GET /api/items
    items_url = BASE_URL + ITEMS_PATH
    try:
        items_resp = requests.get(items_url, headers=headers, timeout=TIMEOUT)
        items_resp.raise_for_status()
    except requests.RequestException as e:
        assert False, f"GET /api/items request failed: {e}"
    items_data = items_resp.json()
    items = items_data.get("items")
    assert items is not None and isinstance(items, list) and len(items) > 0, "Items list is empty or invalid"
    item_id = items[0].get("id")
    assert isinstance(item_id, int) and item_id > 0, "Invalid item id"

    # Step 3: POST /api/transactions/opening-balances with valid admin token and JSON body
    opening_balances_url = BASE_URL + OPENING_BALANCES_PATH
    payload = {
        "itemId": item_id,
        "location": "ADEL",
        "quantity": 100,
        "unitCost": 25.50
    }
    try:
        resp = requests.post(opening_balances_url, headers={**headers, "Content-Type": "application/json"}, json=payload, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"POST /api/transactions/opening-balances request failed: {e}"

    assert resp.status_code == 201, f"Expected status code 201, got {resp.status_code}"
    data = resp.json()
    transaction = data.get("transaction")
    assert transaction is not None, "'transaction' key not found in response"
    assert isinstance(transaction.get("id"), int) and transaction.get("id") > 0, "Invalid or missing transaction id"
    assert transaction.get("transactionType") == "OPENING_BALANCE", f"Expected transactionType 'OPENING_BALANCE', got {transaction.get('transactionType')}"
    assert transaction.get("itemId") == item_id, f"Expected itemId {item_id}, got {transaction.get('itemId')}"
    assert transaction.get("location") == "ADEL", f"Expected location 'ADEL', got {transaction.get('location')}"
    assert float(transaction.get("quantity")) == 100, f"Expected quantity 100, got {transaction.get('quantity')}"
    # unitCost may be null or number; test float equality with 2 decimal precision
    unit_cost_resp = transaction.get("unitCost")
    assert unit_cost_resp is not None, "unitCost missing in response transaction"
    assert abs(float(unit_cost_resp) - 25.50) < 0.01, f"Expected unitCost ~25.50, got {unit_cost_resp}"

test_post_api_transactions_opening_balances_creates_opening_balance_with_admin_token()