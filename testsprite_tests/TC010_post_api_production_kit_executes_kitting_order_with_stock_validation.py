import requests
from requests.exceptions import RequestException
from datetime import datetime
import time

BASE_URL = "http://localhost:3002"
ADMIN_USERNAME = "jose"
ADMIN_PASSWORD = "Password1"
TIMEOUT = 30

def login(username: str, password: str) -> str:
    url = f"{BASE_URL}/api/auth/login"
    payload = {"username": username, "password": password}
    try:
        resp = requests.post(url, json=payload, timeout=TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
        token = data.get("token")
        assert token is not None, "Login response missing token"
        return token
    except RequestException as e:
        raise AssertionError(f"Login failed: {e}")

def get_items(token: str, params=None):
    url = f"{BASE_URL}/api/items"
    headers = {"Authorization": f"Bearer {token}"}
    try:
        resp = requests.get(url, headers=headers, params=params, timeout=TIMEOUT)
        resp.raise_for_status()
        return resp.json().get("items", [])
    except RequestException as e:
        raise AssertionError(f"Get items failed: {e}")

def get_boms(token: str, params=None):
    url = f"{BASE_URL}/api/boms"
    headers = {"Authorization": f"Bearer {token}"}
    try:
        resp = requests.get(url, headers=headers, params=params, timeout=TIMEOUT)
        resp.raise_for_status()
        return resp.json().get("boms", [])
    except RequestException as e:
        raise AssertionError(f"Get BOMs failed: {e}")

def create_opening_balance(token: str, item_id: int, location: str, quantity: float, unit_cost: float):
    url = f"{BASE_URL}/api/transactions/opening-balances"
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "itemId": item_id,
        "location": location,
        "quantity": quantity,
        "unitCost": unit_cost,
        "transactionDate": datetime.utcnow().strftime("%Y-%m-%d")
    }
    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=TIMEOUT)
        resp.raise_for_status()
        return resp.json().get("transaction")
    except RequestException as e:
        raise AssertionError(f"Create opening balance failed: {e}")

def delete_production_order_if_possible(token: str, order_id: int):
    # No delete API for production orders per PRD; skipping actual deletion.
    # If created production order has no cleanup endpoint, skip cleanup.
    pass

def test_post_api_production_kit_executes_kitting_order_with_stock_validation():
    token = login(ADMIN_USERNAME, ADMIN_PASSWORD)
    headers = {"Authorization": f"Bearer {token}"}

    location = "ADEL"
    quantity_produced = 2

    # Step 1: Get items, locate finishedGoodId for TR-7K-UTIL
    items = get_items(token)
    finished_good = next((i for i in items if i.get("itemCode") == "TR-7K-UTIL"), None)
    assert finished_good, "Finished good item TR-7K-UTIL not found"
    finished_good_id = finished_good["id"]

    # Step 2: Get BOMs, find BOM-7K-UTIL (likely id=1)
    boms = get_boms(token, params={"search": "BOM-7K-UTIL", "status": "ACTIVE"})
    if not boms:
        boms = get_boms(token, params={"search": "BOM-7K-UTIL"})
    assert boms, "BOM-7K-UTIL not found"
    bom = boms[0]
    bom_id = bom["id"]

    # Step 3: Get BOM details
    url_bom_detail = f"{BASE_URL}/api/boms/{bom_id}"
    try:
        resp = requests.get(url_bom_detail, headers=headers, timeout=TIMEOUT)
        resp.raise_for_status()
        bom_detail = resp.json().get("bom")
    except RequestException as e:
        raise AssertionError(f"Get BOM detail failed: {e}")

    assert "lines" in bom_detail and len(bom_detail["lines"]) > 0, "BOM has no lines"

    # Step 4: Check stock and create opening balances for components if needed
    url_stock = f"{BASE_URL}/api/transactions/stock-position"
    try:
        resp = requests.get(url_stock, headers=headers, timeout=TIMEOUT)
        resp.raise_for_status()
        positions = resp.json().get("positions", [])
    except RequestException as e:
        raise AssertionError(f"Get stock position failed: {e}")

    stock_map = {}
    for pos in positions:
        item = pos.get("item")
        if not item or "id" not in item:
            continue
        item_id = item["id"]
        adel_qty = pos.get("adelQty", 0)
        stock_map[(item_id, "ADEL")] = adel_qty

    created_opening_balances = []
    for line in bom_detail["lines"]:
        item_id = line["itemId"]
        qty_needed = line["quantityPer"] * quantity_produced
        current_stock = stock_map.get((item_id, "ADEL"), 0)

        if current_stock < qty_needed:
            to_add_qty = qty_needed - current_stock
            item_info = next((i for i in items if i["id"] == item_id), None)
            assert item_info, f"Component item {item_id} not found in items list"
            standard_cost = item_info.get("standardCost") or 1.0

            transaction = create_opening_balance(token, item_id, location, to_add_qty, standard_cost)
            created_opening_balances.append(transaction)
            time.sleep(0.5)

    # Step 5: Prepare components array for production kit
    components = [{"itemId": line["itemId"], "quantityPer": line["quantityPer"]} for line in bom_detail["lines"]]

    # Step 6: Perform POST /api/production/kit with components
    url_production_kit = f"{BASE_URL}/api/production/kit"
    payload = {
        "finishedGoodId": finished_good_id,
        "location": location,
        "quantityProduced": quantity_produced,
        "components": components
    }
    try:
        resp = requests.post(url_production_kit, headers=headers, json=payload, timeout=TIMEOUT)
    except RequestException as e:
        raise AssertionError(f"Production kit POST request failed: {e}")

    assert resp.status_code == 201, f"Expected 201 Created, got {resp.status_code}: {resp.text}"

    data = resp.json()
    order = data.get("order")
    assert order, "Response JSON missing 'order'"

    order_number = order.get("orderNumber")
    order_id = order.get("id")
    assert order_number and str(order_id), "Order missing orderNumber or id"

    # orderNumber pattern KIT-{id}, allow id as int or str
    expected_order_number = f"KIT-{order_id}"
    assert order_number == expected_order_number, f"OrderNumber {order_number} doesn't match ID {expected_order_number}"

    total_cost = order.get("totalCost")
    assert total_cost is not None and total_cost >= 0, "totalCost missing or negative"

    transactions = order.get("transactions")
    assert isinstance(transactions, list) and len(transactions) > 0, "Transactions missing or empty in order"

    consumption_found = any((t.get("type") or "").upper() == "CONSUMPTION" for t in transactions if isinstance(t, dict))
    production_found = any((t.get("type") or "").upper() == "PRODUCTION" for t in transactions if isinstance(t, dict))
    assert consumption_found, "No CONSUMPTION transaction found in order"
    assert production_found, "No PRODUCTION transaction found in order"

test_post_api_production_kit_executes_kitting_order_with_stock_validation()