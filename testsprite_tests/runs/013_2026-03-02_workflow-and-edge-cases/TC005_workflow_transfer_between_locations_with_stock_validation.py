import requests
import time

BASE_URL = "http://localhost:3002/api"
TIMEOUT = 30


def workflow_transfer_between_locations_with_stock_validation():
    session = requests.Session()

    def sleep_rate_limit():
        time.sleep(2)

    # Step 1: Login as user (alix/Password1)
    login_payload = {"username": "alix", "password": "Password1"}
    login_resp = session.post(f"{BASE_URL}/auth/login", json=login_payload, timeout=TIMEOUT)
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    token = login_resp.json().get("token")
    assert token, "No token received on login"
    headers = {"Authorization": f"Bearer {token}"}

    sleep_rate_limit()

    # Step 2: GET /api/items and GET /api/transactions/stock-position to find an item with adelQty > 0
    items_resp = session.get(f"{BASE_URL}/items", headers=headers, timeout=TIMEOUT)
    assert items_resp.status_code == 200, f"Items fetch failed: {items_resp.text}"
    items = items_resp.json().get("items", [])
    assert items, "No items found"

    stock_pos_resp = session.get(f"{BASE_URL}/transactions/stock-position", headers=headers, timeout=TIMEOUT)
    assert stock_pos_resp.status_code == 200, f"Stock position fetch failed: {stock_pos_resp.text}"
    positions = stock_pos_resp.json().get("positions", [])

    # Find an item with adelQty > 0
    item_id = None
    adel_qty = None
    calhoun_qty = None
    for pos in positions:
        if pos.get("adelQty", 0) > 0:
            item_id = pos["item"]["id"] if "item" in pos and "id" in pos["item"] else None
            adel_qty = pos.get("adelQty")
            calhoun_qty = pos.get("calhounQty")
            break

    assert item_id is not None, "No item found with adelQty > 0"
    assert adel_qty is not None, "adelQty missing in stock position"
    assert calhoun_qty is not None, "calhounQty missing in stock position"

    sleep_rate_limit()

    # Step 3: POST /api/transactions/transfers {itemId, fromLocation:'ADEL', toLocation:'CALHOUN', quantity:2}
    transfer_payload_valid = {
        "itemId": item_id,
        "fromLocation": "ADEL",
        "toLocation": "CALHOUN",
        "quantity": 2
    }
    transfer_resp = session.post(f"{BASE_URL}/transactions/transfers", headers=headers, json=transfer_payload_valid, timeout=TIMEOUT)
    assert transfer_resp.status_code == 201, f"Valid transfer failed: {transfer_resp.text}"
    transfer_data = transfer_resp.json().get("transfer")
    assert transfer_data, "No transfer data in response"
    outbound = transfer_data.get("outbound")
    inbound = transfer_data.get("inbound")
    assert outbound and inbound, "Outbound or inbound transfer missing"
    # Validate outbound: quantity is negative, location is ADEL and itemId matches
    assert outbound.get("quantity") < 0, "Outbound quantity not negative"
    assert outbound.get("location") == "ADEL", "Outbound location not ADEL"
    assert outbound.get("itemId") == item_id, "Outbound itemId mismatch"
    # Validate inbound: quantity positive, location CALHOUN and itemId matches
    assert inbound.get("quantity") > 0, "Inbound quantity not positive"
    assert inbound.get("location") == "CALHOUN", "Inbound location not CALHOUN"
    assert inbound.get("itemId") == item_id, "Inbound itemId mismatch"

    sleep_rate_limit()

    # Step 4: GET /api/transactions/stock-position -> verify adelQty decreased by 2 AND calhounQty increased by 2
    stock_pos_after_resp = session.get(f"{BASE_URL}/transactions/stock-position", headers=headers, timeout=TIMEOUT)
    assert stock_pos_after_resp.status_code == 200, f"Stock position fetch failed: {stock_pos_after_resp.text}"
    positions_after = stock_pos_after_resp.json().get("positions", [])
    adel_qty_after = None
    calhoun_qty_after = None
    for pos in positions_after:
        if pos.get("item") and pos["item"].get("id") == item_id:
            adel_qty_after = pos.get("adelQty")
            calhoun_qty_after = pos.get("calhounQty")
            break
    assert adel_qty_after is not None and calhoun_qty_after is not None, "Item positions missing after transfer"
    assert adel_qty_after == adel_qty - 2, f"adelQty not decreased by 2 (was {adel_qty}, now {adel_qty_after})"
    assert calhoun_qty_after == calhoun_qty + 2, f"calhounQty not increased by 2 (was {calhoun_qty}, now {calhoun_qty_after})"

    sleep_rate_limit()

    # Step 5: POST /api/transactions/transfers with same fromLocation and toLocation (ADEL->ADEL) quantity 1 -> verify 400 error
    transfer_payload_same_loc = {
        "itemId": item_id,
        "fromLocation": "ADEL",
        "toLocation": "ADEL",
        "quantity": 1
    }
    transfer_same_loc_resp = session.post(f"{BASE_URL}/transactions/transfers", headers=headers, json=transfer_payload_same_loc, timeout=TIMEOUT)
    assert transfer_same_loc_resp.status_code == 400, f"Transfer with same locations did not fail as expected: {transfer_same_loc_resp.text}"

    sleep_rate_limit()

    # Step 6: POST /api/transactions/transfers with insufficient stock from CALHOUN to ADEL quantity 999999 -> verify 400 error
    transfer_payload_insufficient_stock = {
        "itemId": item_id,
        "fromLocation": "CALHOUN",
        "toLocation": "ADEL",
        "quantity": 999999
    }
    transfer_insufficient_resp = session.post(f"{BASE_URL}/transactions/transfers", headers=headers, json=transfer_payload_insufficient_stock, timeout=TIMEOUT)
    assert transfer_insufficient_resp.status_code == 400, f"Transfer with insufficient stock did not fail as expected: {transfer_insufficient_resp.text}"

    sleep_rate_limit()

    # Step 7: GET /api/transactions?type=TRANSFER -> verify transfer transactions appear in history
    transactions_resp = session.get(f"{BASE_URL}/transactions", headers=headers, params={"type": "TRANSFER"}, timeout=TIMEOUT)
    assert transactions_resp.status_code == 200, f"Fetching transfer transactions failed: {transactions_resp.text}"
    transfers = transactions_resp.json().get("transactions", [])
    assert transfers, "No transfer transactions found in history"
    # Check at least one transaction matches outbound or inbound quantities and locations used above
    found_transfer = False
    for tx in transfers:
        if tx.get("itemId") == item_id and tx.get("quantity") in (-2, 2):
            loc = tx.get("location")
            if loc == "ADEL" or loc == "CALHOUN":
                found_transfer = True
                break
    assert found_transfer, "Transfer transactions with expected itemId and quantities not found in history"


workflow_transfer_between_locations_with_stock_validation()