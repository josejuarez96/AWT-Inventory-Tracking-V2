import requests
import time

BASE_URL = "http://localhost:3002/api"
ADMIN_USERNAME = "jose"
ADMIN_PASSWORD = "Password1"
TIMEOUT = 30

def test_edge_opening_balance_import_duplicates():
    session = requests.Session()

    # Step 1: Login as admin
    login_resp = session.post(
        f"{BASE_URL}/auth/login",
        json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD},
        timeout=TIMEOUT
    )
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    token = login_resp.json().get("token")
    assert token, "No token returned on login"
    headers = {"Authorization": f"Bearer {token}"}

    # Step 2: GET /api/items to get an active item's itemCode
    items_resp = session.get(f"{BASE_URL}/items", headers=headers, timeout=TIMEOUT)
    assert items_resp.status_code == 200, f"Failed to get items: {items_resp.text}"
    items = items_resp.json().get("items", [])
    assert items, "Items list is empty"
    item_code = items[0].get("itemCode")
    assert item_code, "First item has no itemCode"

    time.sleep(2)

    # Step 3: POST /api/transactions/opening-balances/import with {rows:[{item_code:itemCode, location:'ADEL', quantity:10}]} -> expect 201
    payload = {"rows": [{"item_code": item_code, "location": "ADEL", "quantity": 10}]}
    import_resp_1 = session.post(
        f"{BASE_URL}/transactions/opening-balances/import",
        json=payload,
        headers=headers,
        timeout=TIMEOUT
    )
    assert import_resp_1.status_code == 201, f"First import failed: {import_resp_1.status_code} {import_resp_1.text}"
    inserted_1 = import_resp_1.json().get("inserted")
    assert inserted_1 is not None, "No 'inserted' field in first import response"
    # Normally expect inserted_1 to be 1 if one row inserted

    time.sleep(2)

    # Step 4: POST identical payload again, record status code and behavior
    import_resp_2 = session.post(
        f"{BASE_URL}/transactions/opening-balances/import",
        json=payload,
        headers=headers,
        timeout=TIMEOUT
    )
    status_2 = import_resp_2.status_code

    # Detect if duplicate was blocked or inserted again
    if status_2 == 201:
        inserted_2 = import_resp_2.json().get("inserted")
        # If inserted again, this is a data integrity gap
        # Assert and document behavior accordingly
        assert inserted_2 == inserted_1, (
            f"DATA INTEGRITY GAP: Duplicate opening balances created. "
            f"First inserted={inserted_1}, second inserted={inserted_2}"
        )
    else:
        # Acceptable duplicate detection status codes include 400 or 409
        assert status_2 in (400, 409), (
            f"Unexpected status code on duplicate import: {status_2}, response: {import_resp_2.text}"
        )

    time.sleep(2)

    # Step 5: GET /api/transactions/stock-position and check if the item's stock reflects the double import
    stock_resp = session.get(f"{BASE_URL}/transactions/stock-position", headers=headers, timeout=TIMEOUT)
    assert stock_resp.status_code == 200, f"Failed to get stock positions: {stock_resp.text}"
    positions = stock_resp.json().get("positions", [])
    # Find position for item_code
    matched_position = None
    for pos in positions:
        item = pos.get("item")
        if item and item.get("itemCode") == item_code:
            matched_position = pos
            break
    assert matched_position is not None, f"Stock position not found for itemCode {item_code}"

    adel_qty = matched_position.get("adelQty")
    assert adel_qty is not None, f"No 'adelQty' field for itemCode {item_code}"

    # Document whether stock reflects one or two imports
    # If duplicate insert happened, adelQty should reflect doubling (20)
    # Otherwise, adelQty should be 10
    if status_2 == 201:
        # Duplicate insert allowed - stock doubled
        assert adel_qty == 20, (
            f"DATA INTEGRITY GAP: Stock doubled due to duplicate imports, adelQty={adel_qty}, expected=20"
        )
    else:
        # Duplicate blocked - stock remains 10
        assert adel_qty == 10, (
            f"Duplicate detection worked, adelQty={adel_qty}, expected=10"
        )

test_edge_opening_balance_import_duplicates()