import requests

BASE_URL = "http://localhost:3000"
AUTH_ENDPOINT = "/api/auth/login"
ITEMS_ENDPOINT = "/api/items"
BATCH_RECEIPTS_ENDPOINT = "/api/transactions/receipts/batch"

USERNAME = "jose"
PASSWORD = "Password1"
VENDOR_ID = 1
LOCATION = "ADEL"
TRANSACTION_DATE = "2026-02-20"
NOTES = "test"

TIMEOUT = 30

# UOM categories from PRD notes:
# Non-decimal allowed UOMs for this test (quantities must be whole numbers): EA, BUNDLE
# Decimal allowed UOMs (quantities can be decimal): FT
# Example items with codes to find:
# EA items: AX-12K-EZ
# BUNDLE item: LUM-2X4-BDL
# FT item: WR-14GA-BLK

def test_validate_batch_receipts_uom_decimal_restrictions():
    session = requests.Session()

    # 1. Authenticate
    auth_resp = session.post(
        BASE_URL + AUTH_ENDPOINT,
        json={"username": USERNAME, "password": PASSWORD},
        timeout=TIMEOUT
    )
    assert auth_resp.status_code == 200, f"Auth failed: {auth_resp.text}"
    token = auth_resp.json().get("token")
    assert token, "No token received on login"

    session.headers.update({"Authorization": f"Bearer {token}"})

    # 2. Get items list with their itemCodes and unitOfMeasure
    items_resp = session.get(
        BASE_URL + f"{ITEMS_ENDPOINT}?page=1&limit=50",
        timeout=TIMEOUT
    )
    assert items_resp.status_code == 200, f"Failed to get items: {items_resp.text}"
    items_data = items_resp.json()
    items_list = items_data.get("items", [])
    assert items_list, "Items list empty"

    # Helper: find item by code
    def find_item_by_code(code):
        for item in items_list:
            if item.get("itemCode") == code:
                return item
        return None

    # Find needed items
    ea_item = find_item_by_code("AX-12K-EZ")
    bundle_item = find_item_by_code("LUM-2X4-BDL")
    ft_item = find_item_by_code("WR-14GA-BLK")

    assert ea_item, "EA item AX-12K-EZ not found"
    assert bundle_item, "BUNDLE item LUM-2X4-BDL not found"
    assert ft_item, "FT item WR-14GA-BLK not found"

    # Test inputs per test strategy:
    tests = [
        # a. Decimal qty (1.5) with EA item -> expect 400
        {
            "item": ea_item,
            "quantity": 1.5,
            "expected_status": 400
        },
        # b. Decimal qty (1.5) with BUNDLE item -> expect 400
        {
            "item": bundle_item,
            "quantity": 1.5,
            "expected_status": 400
        },
        # c. Decimal qty (1.5) with FT item -> expect 201
        {
            "item": ft_item,
            "quantity": 1.5,
            "expected_status": 201
        },
        # d. Whole number qty (2) with EA item -> expect 201
        {
            "item": ea_item,
            "quantity": 2,
            "expected_status": 201
        }
    ]

    for test_case in tests:
        payload = {
            "vendorId": VENDOR_ID,
            "location": LOCATION,
            "transactionDate": TRANSACTION_DATE,
            "notes": NOTES,
            "lineItems": [
                {
                    "itemId": test_case["item"]["id"],
                    "quantity": test_case["quantity"],
                    "unitCost": 10
                }
            ]
        }
        resp = session.post(
            BASE_URL + BATCH_RECEIPTS_ENDPOINT,
            json=payload,
            timeout=TIMEOUT
        )
        assert resp.status_code == test_case["expected_status"], \
            (f"Failed test for itemCode {test_case['item']['itemCode']} quantity {test_case['quantity']}: "
             f"expected status {test_case['expected_status']}, got {resp.status_code}. Response: {resp.text}")

test_validate_batch_receipts_uom_decimal_restrictions()