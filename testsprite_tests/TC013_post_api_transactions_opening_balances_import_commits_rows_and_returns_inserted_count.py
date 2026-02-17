import requests

BASE_URL = "http://localhost:3000"
LOGIN_ENDPOINT = f"{BASE_URL}/api/auth/login"
ITEMS_ENDPOINT = f"{BASE_URL}/api/items"
IMPORT_ENDPOINT = f"{BASE_URL}/api/transactions/opening-balances/import"

def test_post_api_transactions_opening_balances_import_commits_rows_and_returns_inserted_count():
    try:
        # Step 1: Login to get JWT token
        login_payload = {"username": "jose", "password": "password123"}
        login_resp = requests.post(LOGIN_ENDPOINT, json=login_payload, timeout=30)
        assert login_resp.status_code == 200, f"Login failed with status {login_resp.status_code}"
        login_data = login_resp.json()
        token = login_data.get("token")
        assert token and isinstance(token, str), "Token not found in login response"

        headers = {"Authorization": f"Bearer {token}"}

        # Step 2: Get valid item codes from GET /api/items
        items_resp = requests.get(ITEMS_ENDPOINT, headers=headers, timeout=30)
        assert items_resp.status_code == 200, f"Failed to get items with status {items_resp.status_code}"
        items_data = items_resp.json()
        items = items_data.get("items")
        assert items and isinstance(items, list), "No items found in response"
        first_item = items[0]
        item_code = first_item.get("itemCode") or first_item.get("item_code")
        assert item_code and isinstance(item_code, str), "Valid item_code not found from items"

        # Step 3: POST /api/transactions/opening-balances/import with admin token and JSON body
        import_payload = {
            "rows": [
                {
                    "item_code": item_code,
                    "location": "ADEL",
                    "quantity": 50
                }
            ]
        }
        import_resp = requests.post(IMPORT_ENDPOINT, headers={**headers, "Content-Type": "application/json"}, json=import_payload, timeout=30)
        assert import_resp.status_code == 201, f"Import request failed with status {import_resp.status_code}"
        import_data = import_resp.json()
        inserted = import_data.get("inserted")
        assert isinstance(inserted, int) and inserted >= 0, f"Invalid inserted count: {inserted}"

    except (requests.RequestException, AssertionError) as e:
        raise AssertionError(f"Test TC013 failed: {str(e)}")

test_post_api_transactions_opening_balances_import_commits_rows_and_returns_inserted_count()