import requests

BASE_URL = "http://localhost:3000"
TIMEOUT = 30

def test_post_api_transactions_transfers_creates_atomic_transfer_pair():
    # Authenticate as admin user "jose"
    login_resp = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": "jose", "password": "password123"},
        timeout=TIMEOUT,
    )
    assert login_resp.status_code == 200, "Admin login failed"
    token = login_resp.json().get("token")
    assert token, "Token missing in login response"

    headers_admin = {"Authorization": f"Bearer {token}"}

    # Get first itemId via GET /api/items with auth token
    items_resp = requests.get(f"{BASE_URL}/api/items", headers=headers_admin, timeout=TIMEOUT)
    assert items_resp.status_code == 200, "Failed to get items"
    items_data = items_resp.json()
    items = items_data.get("items", [])
    assert items, "No items found"
    item_id = items[0]["id"]

    # Create opening balance stock for item at location ADEL with quantity 50
    opening_balance_body = {
        "itemId": item_id,
        "location": "ADEL",
        "quantity": 50
    }
    opening_resp = requests.post(
        f"{BASE_URL}/api/transactions/opening-balances",
        headers=headers_admin,
        json=opening_balance_body,
        timeout=TIMEOUT,
    )
    assert opening_resp.status_code == 201, f"Opening balance creation failed: {opening_resp.text}"
    transaction = opening_resp.json().get("transaction")
    assert transaction, "No transaction object in opening balance response"
    opening_id = transaction.get("id")
    assert opening_id, "Opening balance transaction ID missing"

    # Authenticate as normal user "jose" (same admin creds, but using token from above as both admin and user)
    # Already have token, assume the same user can do transfer

    headers_user = {"Authorization": f"Bearer {token}"}

    # Post transfer: itemId, fromLocation ADEL, toLocation CALHOUN, quantity 10
    transfer_body = {
        "itemId": item_id,
        "fromLocation": "ADEL",
        "toLocation": "CALHOUN",
        "quantity": 10
    }
    transfer_resp = requests.post(
        f"{BASE_URL}/api/transactions/transfers",
        headers=headers_user,
        json=transfer_body,
        timeout=TIMEOUT,
    )
    assert transfer_resp.status_code == 201, f"Transfer creation failed: {transfer_resp.text}"
    transfer_data = transfer_resp.json().get("transfer")
    assert transfer_data, "No transfer object in response"

    outbound = transfer_data.get("outbound")
    inbound = transfer_data.get("inbound")
    assert outbound, "Outbound transaction missing"
    assert inbound, "Inbound transaction missing"

    # Check outbound transaction fields
    assert outbound.get("transactionType") == "TRANSFER", "Outbound transactionType not TRANSFER"
    assert outbound.get("location") == "ADEL", "Outbound location incorrect"
    assert isinstance(outbound.get("quantity"), (int, float)), "Outbound quantity not a number"
    assert outbound.get("quantity") < 0, "Outbound quantity not negative"

    # Check inbound transaction fields
    assert inbound.get("transactionType") == "TRANSFER", "Inbound transactionType not TRANSFER"
    assert inbound.get("location") == "CALHOUN", "Inbound location incorrect"
    assert isinstance(inbound.get("quantity"), (int, float)), "Inbound quantity not a number"
    assert inbound.get("quantity") > 0, "Inbound quantity not positive"

    # Check quantities match transfer quantity
    assert abs(outbound.get("quantity")) == transfer_body["quantity"], "Outbound quantity mismatch"
    assert inbound.get("quantity") == transfer_body["quantity"], "Inbound quantity mismatch"

    # Cleanup: No delete endpoint specified, so no cleanup here.

test_post_api_transactions_transfers_creates_atomic_transfer_pair()