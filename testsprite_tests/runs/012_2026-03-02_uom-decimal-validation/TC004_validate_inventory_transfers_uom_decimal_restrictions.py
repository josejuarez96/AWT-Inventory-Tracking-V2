import requests

BASE_URL = "http://localhost:3000"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
ITEMS_URL = f"{BASE_URL}/api/items"
TRANSFERS_URL = f"{BASE_URL}/api/transactions/transfers"

USERNAME = "jose"
PASSWORD = "Password1"

HEADERS = {"Content-Type": "application/json"}
TIMEOUT = 30


def test_validate_inventory_transfers_uom_decimal_restrictions():
    session = requests.Session()

    # Authenticate and get token
    resp = session.post(
        LOGIN_URL,
        json={"username": USERNAME, "password": PASSWORD},
        timeout=TIMEOUT,
        headers=HEADERS,
    )
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    token = resp.json().get("token")
    assert token, "Token not found in login response"
    auth_headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    # Get items and map by itemCode for quick access
    params = {"page": 1, "limit": 50}
    resp = session.get(ITEMS_URL, headers=auth_headers, params=params, timeout=TIMEOUT)
    assert resp.status_code == 200, f"Failed to get items: {resp.text}"
    data = resp.json()
    items = data.get("items", [])
    assert items, "Items list is empty"

    # Helper to find an itemId by itemCode
    def find_item(item_code):
        for i in items:
            if i.get("itemCode") == item_code:
                return i
        return None

    # Items to test per instructions:
    # EA item: AX-12K-EZ (disallow decimals, expect 400 on decimals, 201 on whole number)
    # BUNDLE item: LUM-2X4-BDL (disallow decimals, expect 400 on decimals)
    # FT item: WR-14GA-BLK (allow decimals, expect 201 on decimals)
    ea_item = find_item("AX-12K-EZ")
    bundle_item = find_item("LUM-2X4-BDL")
    ft_item = find_item("WR-14GA-BLK")

    assert ea_item, "EA item AX-12K-EZ not found"
    assert bundle_item, "BUNDLE item LUM-2X4-BDL not found"
    assert ft_item, "FT item WR-14GA-BLK not found"

    # Valid locations and notes
    from_location = "ADEL"
    to_location = "CALHOUN"
    notes = "test"
    # Dates not needed for transfers

    # Test a) Decimal qty (1.5) with EA item -> expect 400
    resp = session.post(
        TRANSFERS_URL,
        headers=auth_headers,
        json={
            "itemId": ea_item["id"],
            "fromLocation": from_location,
            "toLocation": to_location,
            "quantity": 1.5,
            "notes": notes,
        },
        timeout=TIMEOUT,
    )
    assert resp.status_code == 400, (
        f"Expected 400 for decimal qty with EA item, got {resp.status_code}: {resp.text}"
    )

    # Test b) Decimal qty (1.5) with BUNDLE item -> expect 400
    resp = session.post(
        TRANSFERS_URL,
        headers=auth_headers,
        json={
            "itemId": bundle_item["id"],
            "fromLocation": from_location,
            "toLocation": to_location,
            "quantity": 1.5,
            "notes": notes,
        },
        timeout=TIMEOUT,
    )
    assert resp.status_code == 400, (
        f"Expected 400 for decimal qty with BUNDLE item, got {resp.status_code}: {resp.text}"
    )

    # Test c) Decimal qty (1.5) with FT item -> expect 201
    resp = session.post(
        TRANSFERS_URL,
        headers=auth_headers,
        json={
            "itemId": ft_item["id"],
            "fromLocation": from_location,
            "toLocation": to_location,
            "quantity": 1.5,
            "notes": notes,
        },
        timeout=TIMEOUT,
    )
    assert resp.status_code == 201, (
        f"Expected 201 for decimal qty with FT item, got {resp.status_code}: {resp.text}"
    )
    created_transfer_ft = resp.json()

    # Cleanup for FT item transfer
    try:
        # Optionally, delete transfer if API supported deleting transfers, but it's not defined.
        # So no cleanup for transfer here.
        pass
    finally:
        pass

    # Test d) Whole number qty (2) with EA item -> expect 201
    resp = session.post(
        TRANSFERS_URL,
        headers=auth_headers,
        json={
            "itemId": ea_item["id"],
            "fromLocation": from_location,
            "toLocation": to_location,
            "quantity": 2,
            "notes": notes,
        },
        timeout=TIMEOUT,
    )
    assert resp.status_code == 201, (
        f"Expected 201 for whole number qty with EA item, got {resp.status_code}: {resp.text}"
    )
    created_transfer_ea = resp.json()

    # Cleanup transfers if there was a delete endpoint - not documented so skipping

    session.close()


test_validate_inventory_transfers_uom_decimal_restrictions()