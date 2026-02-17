import requests

BASE_URL = "http://localhost:3000"
TIMEOUT = 30

def test_post_api_transactions_opening_balances_creates_opening_balance_with_admin_token():
    try:
        # Step 1: Authenticate as admin user to get JWT token
        login_resp = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "jose", "password": "password123"},
            timeout=TIMEOUT
        )
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        login_data = login_resp.json()
        token = login_data.get("token")
        assert token, "No token received after login"

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

        # Step 2: Get valid itemId from GET /api/items
        items_resp = requests.get(f"{BASE_URL}/api/items", headers=headers, timeout=TIMEOUT)
        assert items_resp.status_code == 200, f"Failed to get items: {items_resp.text}"
        items_data = items_resp.json()
        items = items_data.get("items")
        assert items and isinstance(items, list), "Items list missing or invalid"
        first_item = items[0]
        item_id = first_item.get("id")
        assert isinstance(item_id, int) and item_id > 0, "Invalid itemId obtained"

        # Step 3: POST to /api/transactions/opening-balances to create an opening balance
        payload = {
            "itemId": item_id,
            "location": "CALHOUN",
            "quantity": 100
        }
        post_resp = requests.post(
            f"{BASE_URL}/api/transactions/opening-balances",
            headers=headers,
            json=payload,
            timeout=TIMEOUT
        )

        # Step 4: Assert response status code 201 and validate response body
        assert post_resp.status_code == 201, f"Unexpected status code: {post_resp.status_code}, response: {post_resp.text}"
        resp_data = post_resp.json()
        transaction = resp_data.get("transaction")
        assert transaction, "Response JSON does not contain 'transaction' key"
        assert transaction.get("transactionType") == "OPENING_BALANCE", f"Unexpected transactionType: {transaction.get('transactionType')}"
        assert transaction.get("itemId") == item_id, f"Returned itemId does not match sent itemId"
        assert transaction.get("location") == "CALHOUN", f"Returned location does not match"
        assert transaction.get("quantity") == 100, f"Returned quantity does not match"

    except (requests.RequestException, AssertionError) as e:
        raise AssertionError(f"Test failed: {e}")

test_post_api_transactions_opening_balances_creates_opening_balance_with_admin_token()