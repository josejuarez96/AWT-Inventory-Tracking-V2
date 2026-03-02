import requests
import time

BASE_URL = "http://localhost:3002/api"
TIMEOUT = 30

def test_edge_adjustment_negative_stock_rejected():
    # Step 1: Login as user (alix/Password1)
    login_url = f"{BASE_URL}/auth/login"
    login_payload = {"username": "alix", "password": "Password1"}
    try:
        login_resp = requests.post(login_url, json=login_payload, timeout=TIMEOUT)
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        token = login_resp.json().get("token")
        assert token, "No token received on login"
    except Exception as e:
        assert False, f"Login request failed: {e}"

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    # Step 2: GET /api/items to get a valid itemId
    items_url = f"{BASE_URL}/items"
    try:
        items_resp = requests.get(items_url, headers=headers, timeout=TIMEOUT)
        assert items_resp.status_code == 200, f"GET items failed: {items_resp.text}"
        items_json = items_resp.json()
        items_list = items_json.get("items", [])
        assert len(items_list) > 0, "No items found"
        item_id = items_list[0]["id"]
    except Exception as e:
        assert False, f"GET items request failed: {e}"

    time.sleep(2)

    # Step 3: GET /api/transactions/stock-position to find position for itemId at ADEL, note adelQty
    stock_pos_url = f"{BASE_URL}/transactions/stock-position"
    try:
        stock_resp = requests.get(stock_pos_url, headers=headers, timeout=TIMEOUT)
        assert stock_resp.status_code == 200, f"GET stock-position failed: {stock_resp.text}"
        stock_data = stock_resp.json()
        positions = stock_data.get("positions", [])
        adel_qty = None
        for pos in positions:
            item = pos.get("item")
            if item and item.get("id") == item_id:
                adel_qty = pos.get("adelQty")
                break
        assert adel_qty is not None, f"No stock position found for itemId {item_id} at ADEL"
    except Exception as e:
        assert False, f"GET stock-position request failed: {e}"

    time.sleep(2)

    # Step 4: POST /api/transactions/adjustments with quantity that would make stock negative
    adjustments_url = f"{BASE_URL}/transactions/adjustments"
    negative_quantity = -(adel_qty + 100) if adel_qty is not None else -100
    adjustment_payload = {
        "itemId": item_id,
        "location": "ADEL",
        "quantity": negative_quantity,
        "reason": "Correction",
        "notes": "Attempting to go negative"
    }
    try:
        adjust_resp = requests.post(adjustments_url, headers=headers, json=adjustment_payload, timeout=TIMEOUT)
    except Exception as e:
        assert False, f"POST adjustments request failed: {e}"

    # The expected behavior: 400 error with error about negative stock.
    # If 201, it's a critical data integrity bug.
    if adjust_resp.status_code == 400:
        # Check that error message references negative stock
        try:
            err_json = adjust_resp.json()
            err_msg = str(err_json)
            assert "negative" in err_msg.lower() or "stock" in err_msg.lower(), f"400 received but no indication of negative stock: {err_msg}"
        except Exception:
            # If no JSON or error parsing, we just accept 400 as correct
            pass
    elif adjust_resp.status_code == 201:
        assert False, f"CRITICAL DATA INTEGRITY BUG: Adjustment that made stock negative was created successfully: {adjust_resp.text}"
    else:
        assert False, f"Unexpected status code for negative stock adjustment: {adjust_resp.status_code}, response: {adjust_resp.text}"

    time.sleep(2)

    # Step 5: GET /api/transactions/stock-position to verify stock was NOT changed
    try:
        stock_pos_after_resp = requests.get(stock_pos_url, headers=headers, timeout=TIMEOUT)
        assert stock_pos_after_resp.status_code == 200, f"GET stock-position after adjustment failed: {stock_pos_after_resp.text}"
        stock_data_after = stock_pos_after_resp.json()
        positions_after = stock_data_after.get("positions", [])
        adel_qty_after = None
        for pos in positions_after:
            item = pos.get("item")
            if item and item.get("id") == item_id:
                adel_qty_after = pos.get("adelQty")
                break
        assert adel_qty_after is not None, f"No stock position found for itemId {item_id} at ADEL after adjustment"
        # The adelQty after should be equal to original adelQty because adjustment was rejected
        assert adel_qty_after == adel_qty, f"Stock changed after rejected adjustment! Before: {adel_qty}, After: {adel_qty_after}"
    except Exception as e:
        assert False, f"GET stock-position after adjustment request failed: {e}"

test_edge_adjustment_negative_stock_rejected()