import requests
from requests.exceptions import RequestException
import datetime

BASE_URL = "http://localhost:3000"
TIMEOUT = 30

ADMIN_CREDENTIALS = {
    "username": "jose",
    "password": "Password1"
}
LOCATION = "ADEL"

# Component item codes seeded in the system and used in BOM-7K-UTIL (id=1)
COMPONENT_CODES = ["AX-7K-STD", "BR-10-DRUM", "LT-LED-TAIL", "LT-MARKER", "FT-BOLT-KIT", "CP-2-516"]
FINISHED_GOOD_CODE = "TR-7K-UTIL"
BOM_ID = 1  # likely BOM-7K-UTIL as per instructions


def test_production_kit_creates_order_with_valid_stock():
    session = requests.Session()
    try:
        # 1. Login as admin to get token for setup: create opening balances to ensure sufficient stock & also to get item and vendor IDs
        login_resp = session.post(
            f"{BASE_URL}/api/auth/login",
            json=ADMIN_CREDENTIALS,
            timeout=TIMEOUT
        )
        assert login_resp.status_code == 200, f"Login failed with status {login_resp.status_code}"
        login_data = login_resp.json()
        token = login_data.get("token")
        assert token, "No token returned after login"
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Fetch all items to map item codes to IDs for components and finished good
        items_resp = session.get(f"{BASE_URL}/api/items?all=true", headers=headers, timeout=TIMEOUT)
        assert items_resp.status_code == 200, f"Get items failed with status {items_resp.status_code}"
        items = items_resp.json().get("items", [])
        item_map = {item["itemCode"]: item for item in items}
        # Verify presence of components and finished good items
        missing_components = [code for code in COMPONENT_CODES if code not in item_map]
        assert not missing_components, f"Missing component items: {missing_components}"
        assert FINISHED_GOOD_CODE in item_map, f"Finished good item {FINISHED_GOOD_CODE} not found"

        # 3. Fetch vendors to get a valid vendorId for opening balances
        vendors_resp = session.get(f"{BASE_URL}/api/vendors", headers=headers, timeout=TIMEOUT)
        assert vendors_resp.status_code == 200, f"Get vendors failed with status {vendors_resp.status_code}"
        vendors = vendors_resp.json().get("vendors", [])
        assert vendors, "No vendors found"
        vendor_id = vendors[0]["id"]

        # 4. Create opening balances for components at ADEL to ensure sufficient stock
        # Use a quantity large enough and unitCost 10.0 for simplicity, transactionDate as today ISO string
        today = datetime.date.today().isoformat()
        created_transaction_ids = []
        for code in COMPONENT_CODES:
            item = item_map[code]
            ob_payload = {
                "itemId": item["id"],
                "location": LOCATION,
                "quantity": 100,
                "unitCost": item.get("standardCost") or 10.0,
                "transactionDate": today,
                "notes": "Test opening balance for production kitting"
            }
            ob_resp = session.post(f"{BASE_URL}/api/transactions/opening-balances", headers=headers, json=ob_payload, timeout=TIMEOUT)
            if ob_resp.status_code == 201:
                transaction = ob_resp.json().get("transaction")
                if transaction and "id" in transaction:
                    created_transaction_ids.append(transaction["id"])
            else:
                # If validation error or already exists, we ignore and assume stock is sufficient from previous test runs or seed
                assert ob_resp.status_code in (201, 400), f"Unexpected status {ob_resp.status_code} on opening balance for {code}"

        # 5. Prepare production kit payload for BOM 1 (BOM-7K-UTIL) finished good item TR-7K-UTIL
        finished_good = item_map[FINISHED_GOOD_CODE]
        # Prepare component list as required by API for production kit call
        components = []
        for code in COMPONENT_CODES:
            components.append({
                "itemId": item_map[code]["id"],
                "quantityPer": 1  # Assume quantity per component is 1 for test simplicity
            })

        production_payload = {
            "bomId": BOM_ID,
            "finishedGoodId": finished_good["id"],
            "location": LOCATION,
            "quantityProduced": 10,
            "components": components,
            "notes": "Automated test production kit"
        }

        # 6. Call POST /api/production/kit with valid data
        production_resp = session.post(f"{BASE_URL}/api/production/kit", headers=headers, json=production_payload, timeout=TIMEOUT)

        assert production_resp.status_code == 201, f"Production kit creation failed with status {production_resp.status_code}"
        production_data = production_resp.json()
        order = production_data.get("order")
        total_cost = production_data.get("totalCost")
        transactions = production_data.get("transactions")

        assert order, "No order details returned"
        assert "orderNumber" in order and order["orderNumber"].startswith("KIT-"), "Invalid or missing orderNumber"
        assert (total_cost is None or (isinstance(total_cost, (int, float)) and total_cost >= 0)), "Invalid totalCost returned"
        assert isinstance(transactions, list) and len(transactions) > 0, "No transactions returned"

        # Validate transactions correspond to components consumed and finished goods produced
        # Expect transactions: component consumption (negative qty), production (positive qty)
        component_transaction_itemids = set(c["itemId"] for c in components)
        finished_good_id = finished_good["id"]

        found_consumption = False
        found_production = False

        for t in transactions:
            item_id = t.get("itemId")
            quantity = t.get("quantity")
            # Consumption transactions: for component items with negative quantity
            if item_id in component_transaction_itemids and quantity < 0:
                found_consumption = True
                assert abs(quantity) == production_payload["quantityProduced"] * next(c["quantityPer"] for c in components if c["itemId"] == item_id), "Incorrect consumption qty"
            # Production transaction: for finished good with positive quantity
            if item_id == finished_good_id and quantity == production_payload["quantityProduced"]:
                found_production = True

        assert found_consumption, "No consumption transactions found for components"
        assert found_production, "No production transaction found for finished good"

    finally:
        # Cleanup: No explicit delete endpoint for production orders or transactions; skipping cleanup.
        session.close()


test_production_kit_creates_order_with_valid_stock()
