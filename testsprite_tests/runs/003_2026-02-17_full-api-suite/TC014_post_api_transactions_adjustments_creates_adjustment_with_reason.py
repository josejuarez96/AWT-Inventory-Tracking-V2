import requests

BASE_URL = "http://localhost:3000"
TIMEOUT = 30


def test_post_api_transactions_adjustments_creates_adjustment_with_reason():
    # Authenticate and get JWT token
    login_url = f"{BASE_URL}/api/auth/login"
    credentials = {"username": "jose", "password": "password123"}
    resp = requests.post(login_url, json=credentials, timeout=TIMEOUT)
    assert resp.status_code == 200, f"Login failed with status {resp.status_code}"
    token = resp.json().get("token")
    assert token, "No token received on login"
    headers = {"Authorization": f"Bearer {token}"}

    # Get a valid itemId from GET /api/items
    items_url = f"{BASE_URL}/api/items"
    resp = requests.get(items_url, headers=headers, timeout=TIMEOUT)
    assert resp.status_code == 200, f"Failed to get items, status {resp.status_code}"
    items = resp.json().get("items")
    assert items and isinstance(items, list), "No items found or invalid format"
    item_id = items[0].get("id")
    assert isinstance(item_id, int), "Invalid item id retrieved"

    adjustment_url = f"{BASE_URL}/api/transactions/adjustments"
    payload = {
        "itemId": item_id,
        "location": "ADEL",
        "quantity": -3,
        "reason": "Damage",
        "notes": "Broken in shipping"
    }

    # Make POST request to create adjustment
    resp = requests.post(adjustment_url, json=payload, headers=headers, timeout=TIMEOUT)
    assert resp.status_code == 201, f"Expected 201 Created but got {resp.status_code}"
    data = resp.json()
    transaction = data.get("transaction")
    assert transaction, "Response missing 'transaction' key"
    assert transaction.get("transactionType") == "ADJUSTMENT", "transactionType is not 'ADJUSTMENT'"

    notes = transaction.get("notes")
    assert notes is not None, "Notes field is missing in transaction"
    expected_notes_prefix = "[Damage] "
    assert notes.startswith(expected_notes_prefix), f"Notes do not start with expected prefix '[Damage] '"
    expected_full_notes = "[Damage] Broken in shipping"
    assert notes == expected_full_notes, f"Notes do not match expected: '{expected_full_notes}'"


test_post_api_transactions_adjustments_creates_adjustment_with_reason()