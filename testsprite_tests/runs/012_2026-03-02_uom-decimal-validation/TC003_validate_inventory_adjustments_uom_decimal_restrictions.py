import requests

BASE_URL = "http://localhost:3000"
TIMEOUT = 30


def validate_inventory_adjustments_uom_decimal_restrictions():
    session = requests.Session()
    try:
        # 1. Authenticate
        login_resp = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "jose", "password": "Password1"},
            timeout=TIMEOUT,
        )
        assert login_resp.status_code == 200, "Login failed"
        token = login_resp.json().get("token")
        assert token, "No token received"
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Get all items to find required items by itemCode and UOM group
        items_resp = session.get(f"{BASE_URL}/api/items?page=1&limit=50", headers=headers, timeout=TIMEOUT)
        assert items_resp.status_code == 200, "Failed to get items"
        items_data = items_resp.json()
        items_list = items_data.get("items", [])
        assert len(items_list) > 0, "No items found"

        # Mapping itemCode to item info for test
        # Available EA items: AX-12K-EZ, AX-7K-STD, BR-10-DRUM, BR-12-DISC, LT-LED-TAIL, LT-MARKER, CP-2-516
        # BUNDLE item: LUM-2X4-BDL
        # FT item: WR-14GA-BLK
        # We need to find these three UOM types' itemIds and UOMs:

        # Find item dicts by itemCode
        item_ea = next((i for i in items_list if i.get("itemCode") == "AX-12K-EZ"), None)
        assert item_ea, "EA item AX-12K-EZ not found"
        item_bundle = next((i for i in items_list if i.get("itemCode") == "LUM-2X4-BDL"), None)
        assert item_bundle, "BUNDLE item LUM-2X4-BDL not found"
        item_ft = next((i for i in items_list if i.get("itemCode") == "WR-14GA-BLK"), None)
        assert item_ft, "FT item WR-14GA-BLK not found"

        # We will also test whole number quantity with EA item

        url = f"{BASE_URL}/api/transactions/adjustments"

        # Constants
        location = "ADEL"
        reason = "Correction"
        notes = "test"
        adjustment_type = "ADD"

        # Helper to post adjustment and return response
        def post_adjustment(item_id, qty):
            payload = {
                "itemId": item_id,
                "location": location,
                "adjustmentType": adjustment_type,
                "quantity": qty,
                "reason": reason,
                "notes": notes,
            }
            return session.post(url, json=payload, headers=headers, timeout=TIMEOUT)

        # a. Decimal qty (1.5) with EA item -> expect 400
        resp = post_adjustment(item_ea["id"], 1.5)
        assert resp.status_code == 400, f"Expected 400 for decimal qty with EA item, got {resp.status_code}"

        # b. Decimal qty (1.5) with BUNDLE item -> expect 400 (new validation)
        resp = post_adjustment(item_bundle["id"], 1.5)
        assert resp.status_code == 400, f"Expected 400 for decimal qty with BUNDLE item, got {resp.status_code}"

        # c. Decimal qty (1.5) with FT item -> expect 201 (decimals allowed)
        resp = post_adjustment(item_ft["id"], 1.5)
        assert resp.status_code == 201, f"Expected 201 for decimal qty with FT item, got {resp.status_code}"

        # Cleanup: delete this adjustment if created (id expected in response)
        created_adjustment_id = None
        if resp.status_code == 201:
            created_adjustment_id = resp.json().get("id")

        # d. Whole number qty (2) with EA item -> expect 201
        resp2 = post_adjustment(item_ea["id"], 2)
        assert resp2.status_code == 201, f"Expected 201 for whole number qty with EA item, got {resp2.status_code}"
        created_adjustment_id_2 = resp2.json().get("id") if resp2.status_code == 201 else None

    finally:
        # Clean up created adjustments by DELETE if possible (not documented, so we skip)
        # This step is skipped because DELETE endpoint is not specified in PRD.
        pass


validate_inventory_adjustments_uom_decimal_restrictions()