import requests

BASE_URL = "http://localhost:3000"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
BOMS_URL = f"{BASE_URL}/api/boms"
PRODUCTION_KIT_URL = f"{BASE_URL}/api/production/kit"
ITEMS_URL = f"{BASE_URL}/api/items"

USERNAME = "jose"
PASSWORD = "Password1"

WHOLE_NUMBER_UOMS = {"EA", "BOX", "BUNDLE", "ROLL", "PACK", "BAG", "SHEET", "SPOOL", "SET", "PAIR"}
DECIMAL_ALLOWED_UOMS = {"FT", "LB", "GAL", "KG", "M", "SQ FT"}

def test_validate_instant_kit_production_uom_decimal_restrictions():
    try:
        # Login
        login_resp = requests.post(
            LOGIN_URL,
            json={"username": USERNAME, "password": PASSWORD},
            timeout=30,
        )
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        token = login_resp.json().get("token")
        assert token, "Token not found in login response"
        headers = {"Authorization": f"Bearer {token}"}
        
        bom_id = 5  # Use fixed bomId as per PRD example

        bom_resp = requests.get(f"{BOMS_URL}/{bom_id}", headers=headers, timeout=30)
        assert bom_resp.status_code == 200, f"Failed to get BOM {bom_id}: {bom_resp.text}"
        bom = bom_resp.json()
        
        finished_good_item_id = None
        if isinstance(bom, dict):
            if "finishedGood" in bom and "itemId" in bom["finishedGood"]:
                finished_good_item_id = bom["finishedGood"]["itemId"]
            elif "finishedGoodItemId" in bom:
                finished_good_item_id = bom["finishedGoodItemId"]
            elif "finishedGoodId" in bom:
                finished_good_item_id = bom["finishedGoodId"]
            else:
                raise AssertionError("Unable to find finished good item id in BOM details")
        else:
            raise AssertionError("BOM response JSON is not an object")

        fg_item_resp = requests.get(f"{ITEMS_URL}/{finished_good_item_id}", headers=headers, timeout=30)
        assert fg_item_resp.status_code == 200, f"Failed to get finished good item {finished_good_item_id}: {fg_item_resp.text}"
        fg_item = fg_item_resp.json()
        fg_uom = fg_item.get("unitOfMeasure")
        assert fg_uom in WHOLE_NUMBER_UOMS.union(DECIMAL_ALLOWED_UOMS), f"Unknown UOM for finished good item: {fg_uom}"

        components = bom.get("components")
        assert isinstance(components, list) and len(components) > 0, "BOM components missing or empty"

        comp_item_id = components[0].get("itemId")
        assert comp_item_id is not None, "Component itemId missing in BOM components"
        comp_item_resp = requests.get(f"{ITEMS_URL}/{comp_item_id}", headers=headers, timeout=30)
        assert comp_item_resp.status_code == 200, f"Failed to get component item {comp_item_id}: {comp_item_resp.text}"
        comp_item = comp_item_resp.json()
        comp_uom = comp_item.get("unitOfMeasure")
        assert comp_uom in WHOLE_NUMBER_UOMS.union(DECIMAL_ALLOWED_UOMS), f"Unknown UOM for component item: {comp_uom}"

        def post_production_kit(quantity, expected_status):
            payload = {"bomId": bom_id, "location": "ADEL", "quantity": quantity}
            resp = requests.post(PRODUCTION_KIT_URL, json=payload, headers=headers, timeout=30)
            assert resp.status_code == expected_status, f"Expected {expected_status}, got {resp.status_code} for quantity {quantity}, Response: {resp.text}"
            return resp

        valid_qty = 2
        post_production_kit(valid_qty, 201)

        invalid_qty = 1.5

        if (fg_uom in WHOLE_NUMBER_UOMS) or (comp_uom in WHOLE_NUMBER_UOMS):
            resp = post_production_kit(invalid_qty, 400)
            try:
                err_json = resp.json()
                err_msg = err_json.get("message") or err_json.get("error") or ""
                assert "whole number" in err_msg.lower()
            except Exception:
                pass
        else:
            post_production_kit(invalid_qty, 201)

    except AssertionError:
        raise
    except Exception as e:
        raise AssertionError(f"Unexpected error during test execution: {e}")

test_validate_instant_kit_production_uom_decimal_restrictions()
