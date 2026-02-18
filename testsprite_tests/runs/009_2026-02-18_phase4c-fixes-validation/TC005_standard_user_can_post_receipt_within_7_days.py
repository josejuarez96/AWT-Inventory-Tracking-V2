import requests
import datetime
import time

BASE_URL = "http://localhost:3002"
USERNAME = "alix"
PASSWORD = "Password1"
TIMEOUT = 30

def test_TC005_standard_user_can_post_receipt_within_7_days():
    try:
        # Login as standard user
        login_resp = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": USERNAME, "password": PASSWORD},
            timeout=TIMEOUT,
        )
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        token = login_resp.json().get("token")
        assert token, "Token not found in login response"
        headers = {"Authorization": f"Bearer {token}"}
        time.sleep(2)

        # Get list of items to find a valid itemId
        items_resp = requests.get(
            f"{BASE_URL}/api/items",
            headers=headers,
            timeout=TIMEOUT,
        )
        assert items_resp.status_code == 200, f"Failed to get items: {items_resp.text}"
        items = items_resp.json().get("items")
        assert items and isinstance(items, list), "Invalid items list"
        item = items[0]
        item_id = item.get("id")
        assert item_id is not None, "No item id found in items list"
        time.sleep(2)

        # Get list of vendors to find a valid vendorId
        vendors_resp = requests.get(
            f"{BASE_URL}/api/vendors",
            headers=headers,
            timeout=TIMEOUT,
        )
        assert vendors_resp.status_code == 200, f"Failed to get vendors: {vendors_resp.text}"
        vendors = vendors_resp.json().get("vendors")
        assert vendors and isinstance(vendors, list), "Invalid vendors list"
        vendor_id = vendors[0].get("id")
        assert vendor_id is not None, "No vendor id found in vendors list"
        time.sleep(2)

        # Calculate transactionDate 3 days ago in YYYY-MM-DD
        transaction_date = (datetime.datetime.utcnow() - datetime.timedelta(days=3)).date().isoformat()

        # Post receipt with transactionDate within 7 days for standard user
        receipt_payload = {
            "itemId": item_id,
            "vendorId": vendor_id,
            "location": "ADEL",
            "quantity": 1,
            "unitCost": 5.00,
            "transactionDate": transaction_date,
        }
        post_resp = requests.post(
            f"{BASE_URL}/api/transactions/receipts",
            json=receipt_payload,
            headers=headers,
            timeout=TIMEOUT,
        )
        assert post_resp.status_code == 201, f"Receipt creation failed: {post_resp.status_code}, {post_resp.text}"
        resp_json = post_resp.json()
        assert "transaction" in resp_json, "Response missing 'transaction'"
        assert "lastPaidPrice" in resp_json, "Response missing 'lastPaidPrice'"
        transaction = resp_json["transaction"]
        assert transaction.get("item") and transaction["item"].get("id") == item_id, "Returned transaction itemId mismatch"
        assert transaction.get("vendor") and transaction["vendor"].get("id") == vendor_id, "Returned transaction vendorId mismatch"
        assert transaction.get("location") == "ADEL"
        assert transaction.get("quantity") == 1
        assert abs(float(transaction.get("unitCost", 0)) - 5.00) < 0.001
        # transactionDate in response may have time component, compare date part only
        response_date = transaction.get("transactionDate")
        assert response_date and response_date.startswith(transaction_date), "transactionDate mismatch"

    except (requests.RequestException, AssertionError) as e:
        raise AssertionError(f"Test TC005 failed: {e}")

test_TC005_standard_user_can_post_receipt_within_7_days()
