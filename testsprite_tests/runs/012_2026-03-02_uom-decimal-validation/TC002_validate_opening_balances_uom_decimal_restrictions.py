import requests

BASE_URL = "http://localhost:3000"
TIMEOUT = 30

def test_validate_opening_balances_uom_decimal_restrictions():
    session = requests.Session()

    # Step 1: Authenticate
    auth_resp = session.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": "jose", "password": "Password1"},
        timeout=TIMEOUT,
    )
    assert auth_resp.status_code == 200, f"Auth failed: {auth_resp.text}"
    token = auth_resp.json().get("token")
    assert token, "No token received on auth"

    session.headers.update({"Authorization": f"Bearer {token}"})

    # Step 2: Get items list to find required items by itemCode
    items_resp = session.get(f"{BASE_URL}/api/items?page=1&limit=50", timeout=TIMEOUT)
    assert items_resp.status_code == 200, f"Failed to get items: {items_resp.text}"
    items_data = items_resp.json()
    items_list = items_data.get("items", [])
    assert items_list, "No items found in items list"

    # Map itemCode to id and UOM for test
    item_info = {}
    for item in items_list:
        code = item.get("itemCode") or item.get("item_code")
        if not code:
            continue
        item_info[code] = {"id": item["id"], "unitOfMeasure": item.get("unitOfMeasure") or item.get("unit_of_measure")}

    # Items from instructions:
    # EA item: AX-12K-EZ (non-decimal UOM)
    # BUNDLE item: LUM-2X4-BDL (non-decimal UOM)
    # FT item: WR-14GA-BLK (decimal allowed)
    # Confirm they exist in item_info
    required_codes = ["AX-12K-EZ", "LUM-2X4-BDL", "WR-14GA-BLK"]
    for code in required_codes:
        assert code in item_info, f"Test item {code} not found in items list"

    results = []

    def post_opening_balance(item_id, quantity, expect_status):
        payload = {
            "itemId": item_id,
            "location": "CALHOUN",
            "quantity": quantity,
            "unitCost": 10,
        }
        resp = session.post(
            f"{BASE_URL}/api/transactions/opening-balances",
            json=payload,
            timeout=TIMEOUT,
        )
        assert resp.status_code == expect_status, (
            f"Unexpected status {resp.status_code} for itemId {item_id} quantity {quantity}, response: {resp.text}"
        )
        return resp

    # a. Decimal qty (1.5) with EA item -> expect 400
    ea_item_id = item_info["AX-12K-EZ"]["id"]
    post_opening_balance(ea_item_id, 1.5, 400)

    # b. Decimal qty (1.5) with BUNDLE item -> expect 400 (NEW validation)
    bundle_item_id = item_info["LUM-2X4-BDL"]["id"]
    post_opening_balance(bundle_item_id, 1.5, 400)

    # c. Decimal qty (1.5) with FT item -> expect 201 (decimals allowed)
    ft_item_id = item_info["WR-14GA-BLK"]["id"]
    post_opening_balance(ft_item_id, 1.5, 201)

    # d. Whole number qty (2) with EA item -> expect 201
    post_opening_balance(ea_item_id, 2, 201)

test_validate_opening_balances_uom_decimal_restrictions()