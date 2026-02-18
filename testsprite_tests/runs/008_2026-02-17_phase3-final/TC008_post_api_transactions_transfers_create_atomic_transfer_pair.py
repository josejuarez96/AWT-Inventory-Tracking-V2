import requests
from requests.auth import HTTPBasicAuth
import datetime

BASE_URL = "http://localhost:3002"
ADMIN_USERNAME = "jose"
ADMIN_PASSWORD = "Password1"
TIMEOUT = 30

def test_post_api_transactions_transfers_create_atomic_transfer_pair():
    session = requests.Session()
    try:
        # Step 1: Authenticate as admin to get JWT token
        auth_resp = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD},
            timeout=TIMEOUT
        )
        assert auth_resp.status_code == 200, f"Auth failed: {auth_resp.text}"
        auth_data = auth_resp.json()
        token = auth_data.get("token")
        assert token and isinstance(token, str), "Missing token in auth response"
        headers = {"Authorization": f"Bearer {token}"}

        # Step 2: Get list of items to pick a valid itemId
        items_resp = session.get(f"{BASE_URL}/api/items", headers=headers, timeout=TIMEOUT)
        assert items_resp.status_code == 200, f"Get items failed: {items_resp.text}"
        items_data = items_resp.json()
        items = items_data.get("items")
        assert items and isinstance(items, list), "No items found to test transfer"
        # Pick first active item with positive standardCost for a valid transfer candidate
        item = None
        for it in items:
            if it.get("id") and it.get("standardCost", 0) > 0:
                item = it
                break
        assert item is not None, "No suitable item found for transfer"
        item_id = item["id"]

        # Step 3: Check stock position for the chosen item to ensure sufficient stock at ADEL
        stock_resp = session.get(f"{BASE_URL}/api/transactions/stock-position?page=1&limit=50", headers=headers, timeout=TIMEOUT)
        assert stock_resp.status_code == 200, f"Get stock position failed: {stock_resp.text}"
        stock_data = stock_resp.json()
        positions = stock_data.get("positions", [])
        stock_position = None
        for pos in positions:
            if pos.get("item", {}).get("id") == item_id and pos.get("adelQty", 0) > 0:
                stock_position = pos
                break
        # If no stock at ADEL location, create an opening balance receipt to add stock first
        if not stock_position or stock_position["adelQty"] < 5:
            # We need a vendor to create receipt/opening balance
            vendors_resp = session.get(f"{BASE_URL}/api/vendors", headers=headers, timeout=TIMEOUT)
            assert vendors_resp.status_code == 200, f"Get vendors failed: {vendors_resp.text}"
            vendors_data = vendors_resp.json()
            vendors = vendors_data.get("vendors", [])
            assert vendors and isinstance(vendors, list), "No vendors available for stock setup"
            vendor = vendors[0]
            vendor_id = vendor.get("id")
            assert vendor_id is not None, "Vendor does not have id"

            # Create an opening balance transaction to add stock for this item at ADEL
            open_bal_body = {
                "itemId": item_id,
                "location": "ADEL",
                "quantity": 10,
                "unitCost": item.get("standardCost", 1),
                "transactionDate": datetime.date.today().isoformat(),
                "notes": "Setup stock for transfer test"
            }
            opening_resp = session.post(f"{BASE_URL}/api/transactions/opening-balances", headers=headers, json=open_bal_body, timeout=TIMEOUT)
            assert opening_resp.status_code == 201, f"Opening balance creation failed: {opening_resp.text}"

        # Step 4: Prepare transfer data with adequate quantity (e.g., 5)
        transfer_body = {
            "itemId": item_id,
            "fromLocation": "ADEL",
            "toLocation": "CALHOUN",
            "quantity": 5,
            "notes": "Automated test atomic transfer pair"
        }
        # Step 5: Perform the transfer POST request
        transfer_resp = session.post(f"{BASE_URL}/api/transactions/transfers", headers=headers, json=transfer_body, timeout=TIMEOUT)
        assert transfer_resp.status_code == 201, f"Transfer creation failed: {transfer_resp.text}"
        transfer_data = transfer_resp.json()
        transfer = transfer_data.get("transfer")
        assert transfer and "outbound" in transfer and "inbound" in transfer, "Transfer response missing outbound or inbound transactions"

        # Validate outbound transaction (negative quantity, fromLocation)
        outbound = transfer["outbound"]
        assert outbound.get("itemId") == item_id, "Outbound itemId mismatch"
        assert outbound.get("location") == transfer_body["fromLocation"], "Outbound fromLocation mismatch"
        assert outbound.get("quantity") == -transfer_body["quantity"], "Outbound quantity should be negative"
        assert "type" in outbound and outbound.get("type") == "TRANSFER", f"Outbound transaction type mismatch: expected 'TRANSFER' got '{outbound.get('type')}'"

        # Validate inbound transaction (positive quantity, toLocation)
        inbound = transfer["inbound"]
        assert inbound.get("itemId") == item_id, "Inbound itemId mismatch"
        assert inbound.get("location") == transfer_body["toLocation"], "Inbound toLocation mismatch"
        assert inbound.get("quantity") == transfer_body["quantity"], "Inbound quantity mismatch"
        assert "type" in inbound and inbound.get("type") == "TRANSFER", f"Inbound transaction type mismatch: expected 'TRANSFER' got '{inbound.get('type')}'"

    finally:
        # Cleanup is not possible since no DELETE endpoint for transactions and transfers are atomic pairs
        # This test assumes isolation or a test environment that resets DB between tests
        pass

test_post_api_transactions_transfers_create_atomic_transfer_pair()
