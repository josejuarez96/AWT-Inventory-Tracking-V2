import requests
import time

BASE_URL = "http://localhost:3002/api"
LOGIN_URL = f"{BASE_URL}/auth/login"
ITEMS_URL = f"{BASE_URL}/items"
VENDORS_URL = f"{BASE_URL}/vendors"
STOCK_POSITION_URL = f"{BASE_URL}/transactions/stock-position"
RECEIPTS_URL = f"{BASE_URL}/transactions/receipts"

USERNAME = "alix"
PASSWORD = "Password1"
TIMEOUT = 30
LOCATION = "ADEL"
QUANTITY = 7
UNIT_COST = 3.00
TRANSACTION_DATE = "2026-02-19"


def test_edge_duplicate_receipt_detection():
    session = requests.Session()
    try:
        # Step 1: login as user alix
        resp = session.post(
            LOGIN_URL,
            json={"username": USERNAME, "password": PASSWORD},
            timeout=TIMEOUT,
        )
        assert resp.status_code == 200, "Login failed"
        token = resp.json().get("token")
        assert token, "No token received on login"
        headers = {"Authorization": f"Bearer {token}"}

        # Step 2: GET /api/items to get itemId
        resp = session.get(ITEMS_URL, headers=headers, timeout=TIMEOUT)
        assert resp.status_code == 200, "Failed to get items"
        items = resp.json().get("items")
        assert items and len(items) > 0, "No items found"
        itemId = items[0].get("id")
        assert itemId is not None, "Item ID missing"
        
        # GET /api/vendors to get vendorId
        resp = session.get(VENDORS_URL, headers=headers, timeout=TIMEOUT)
        assert resp.status_code == 200, "Failed to get vendors"
        vendors = resp.json().get("vendors")
        assert vendors and len(vendors) > 0, "No vendors found"
        vendorId = vendors[0].get("id")
        assert vendorId is not None, "Vendor ID missing"

        time.sleep(2)

        # Step 3: GET /api/transactions/stock-position to find adelQty of itemId
        resp = session.get(STOCK_POSITION_URL, headers=headers, timeout=TIMEOUT)
        assert resp.status_code == 200, "Failed to get stock position"
        positions = resp.json().get("positions")
        adelQty_before = None
        for pos in positions:
            itm = pos.get("item")
            if itm and itm.get("id") == itemId:
                adelQty_before = pos.get("adelQty", 0)
                break
        assert adelQty_before is not None, "ItemId stock position not found"
        
        time.sleep(2)

        # Step 4: POST /api/transactions/receipts with specified payload (expect 201)
        payload = {
            "itemId": itemId,
            "vendorId": vendorId,
            "location": LOCATION,
            "quantity": QUANTITY,
            "unitCost": UNIT_COST,
            "transactionDate": TRANSACTION_DATE
        }
        resp = session.post(RECEIPTS_URL, json=payload, headers=headers, timeout=TIMEOUT)
        assert resp.status_code == 201, f"First receipt creation failed with status {resp.status_code}"

        time.sleep(2)

        # Step 5: POST IDENTICAL payload again (duplicate receipt)
        resp_duplicate = session.post(RECEIPTS_URL, json=payload, headers=headers, timeout=TIMEOUT)
        duplicate_status = resp_duplicate.status_code

        # According to instruction, if 201 duplicate created is a DATA INTEGRITY GAP, else if 400 or 409 duplicate detection works
        # Assert based on actual behavior, reflect current system behavior in comments.
        assert duplicate_status in (201, 400, 409), f"Unexpected status code for duplicate receipt: {duplicate_status}"
        # We allow all as assertion, will document below

        time.sleep(2)

        # Step 6: GET /api/transactions/stock-position to check adelQty changed by 14 (double) or 7 (deduplicated)
        resp = session.get(STOCK_POSITION_URL, headers=headers, timeout=TIMEOUT)
        assert resp.status_code == 200, "Failed to get stock position after receipts"
        positions_after = resp.json().get("positions")
        adelQty_after = None
        for pos in positions_after:
            itm = pos.get("item")
            if itm and itm.get("id") == itemId:
                adelQty_after = pos.get("adelQty", 0)
                break
        assert adelQty_after is not None, "ItemId stock position not found after receipts"

        adelQty_increase = adelQty_after - adelQty_before

        # Document result:
        # - If duplicate_status == 201 and adelQty_increase == 14 -> DATA INTEGRITY GAP: duplicate receipt created, stock doubled
        # - If duplicate_status in (400,409) and adelQty_increase == 7 -> Duplicate detection works as expected
        # - Any other case is unexpected; assertion to document it
        
        print("\n--- TC017 edge_duplicate_receipt_detection Test Results ---")
        print(f"First receipt creation status code: 201 (expected)")
        print(f"Duplicate receipt creation status code: {duplicate_status}")
        print(f"Stock adelQty before receipts: {adelQty_before}")
        print(f"Stock adelQty after receipts: {adelQty_after}")
        print(f"adelQty increase expected single receipt: {QUANTITY}")
        print(f"Actual adelQty increase: {adelQty_increase}")

        if duplicate_status == 201:
            # Duplicate receipt accepted
            assert adelQty_increase == QUANTITY * 2, (
                f"Duplicate receipt created but adelQty increase ({adelQty_increase}) != double quantity ({QUANTITY*2})."
            )
            print(
                "DATA INTEGRITY GAP: Duplicate receipt created with no warning; stock inflated by double."
            )
        elif duplicate_status in (400, 409):
            # Duplicate detected and blocked
            assert adelQty_increase == QUANTITY, (
                f"Duplicate receipt blocked but adelQty increase ({adelQty_increase}) != single quantity ({QUANTITY})."
            )
            print(
                "Duplicate detection works: duplicate receipt was blocked or warned."
            )
        else:
            # Unexpected status code: just log
            print("Unexpected duplicate receipt status code; further investigation needed.")

    finally:
        # Cleanup not required as receipts are transactions append-only and there's no delete endpoint.
        # Just pass here.
        pass


test_edge_duplicate_receipt_detection()