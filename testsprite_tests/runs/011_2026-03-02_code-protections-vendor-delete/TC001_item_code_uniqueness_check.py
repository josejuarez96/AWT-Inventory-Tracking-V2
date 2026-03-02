import requests

BASE_URL = "http://localhost:3000"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
VENDORS_URL = f"{BASE_URL}/api/vendors"
ITEMS_URL = f"{BASE_URL}/api/items"
ITEMS_CHECK_CODE_URL = f"{ITEMS_URL}/check-code"

TIMEOUT = 30


def get_auth_token(username: str, password: str) -> str:
    try:
        resp = requests.post(
            LOGIN_URL,
            json={"username": username, "password": password},
            timeout=TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json().get("token", "")
    except Exception:
        raise


def test_item_code_uniqueness_check():
    # Authenticate as standard user (alix)
    token = get_auth_token("alix", "Password1")
    headers = {"Authorization": f"Bearer {token}"}

    # 1) Discover an existing item code and its id
    try:
        resp_items = requests.get(
            f"{ITEMS_URL}?page=1&limit=50&all=true", headers=headers, timeout=TIMEOUT
        )
        resp_items.raise_for_status()
        data = resp_items.json()
        items = data.get("items", [])
        assert len(items) > 0, "No items found to test"
    except Exception as e:
        raise AssertionError(f"Failed to get items for discovery: {e}")

    first_item = items[0]
    item_code = first_item.get("itemCode")
    item_id = first_item.get("id")
    assert item_code and item_id, "Discovered item missing itemCode or id"

    # Prepare lowercase variant of the discovered itemCode
    item_code_lower = item_code.lower()

    # 2) GET /api/items/check-code?code=<discovered_code> → {exists:true, id:<discovered_id>}
    try:
        resp_check_upper = requests.get(
            ITEMS_CHECK_CODE_URL,
            headers=headers,
            params={"code": item_code},
            timeout=TIMEOUT,
        )
        resp_check_upper.raise_for_status()
        res_data_upper = resp_check_upper.json()
        assert res_data_upper.get("exists") is True, "Expected exists:true for uppercase code"
        assert res_data_upper.get("id") == item_id, "Expected matching item id for uppercase code"
    except Exception as e:
        raise AssertionError(f"Failed upper case check: {e}")

    # 3) GET /api/items/check-code?code=<lowercase_version> → should also return {exists:true}
    try:
        resp_check_lower = requests.get(
            ITEMS_CHECK_CODE_URL,
            headers=headers,
            params={"code": item_code_lower},
            timeout=TIMEOUT,
        )
        resp_check_lower.raise_for_status()
        res_data_lower = resp_check_lower.json()
        assert res_data_lower.get("exists") is True, "Expected exists:true for lowercase code"
        assert res_data_lower.get("id") == item_id, "Expected matching item id for lowercase code"
    except Exception as e:
        raise AssertionError(f"Failed lower case check: {e}")

    # 4) GET /api/items/check-code?code=ZZZZZ-NONEXISTENT → {exists:false, id:null}
    try:
        resp_check_nonexistent = requests.get(
            ITEMS_CHECK_CODE_URL,
            headers=headers,
            params={"code": "ZZZZZ-NONEXISTENT"},
            timeout=TIMEOUT,
        )
        resp_check_nonexistent.raise_for_status()
        res_data_nonexistent = resp_check_nonexistent.json()
        assert res_data_nonexistent.get("exists") is False, "Expected exists:false for non-existent code"
        assert res_data_nonexistent.get("id") is None, "Expected id:null for non-existent code"
    except Exception as e:
        raise AssertionError(f"Failed check for non-existent code: {e}")

    # 5) GET /api/items/check-code (no param) → 400
    try:
        resp_check_no_param = requests.get(
            ITEMS_CHECK_CODE_URL, headers=headers, timeout=TIMEOUT
        )
        assert resp_check_no_param.status_code == 400, "Expected status 400 when code param is missing"
        json_data = resp_check_no_param.json()
        assert "error" in json_data, "Expected error message in response when code param missing"
        expected_msg = "code query parameter is required"
        assert json_data["error"] == expected_msg, f"Expected error message '{expected_msg}', got '{json_data['error']}'"
    except Exception as e:
        raise AssertionError(f"Failed check code param missing case: {e}")


test_item_code_uniqueness_check()