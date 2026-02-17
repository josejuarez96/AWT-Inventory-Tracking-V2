import requests

BASE_URL = "http://localhost:3000"
TIMEOUT = 30

def login(username: str, password: str) -> str:
    url = f"{BASE_URL}/api/auth/login"
    payload = {"username": username, "password": password}
    resp = requests.post(url, json=payload, timeout=TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    return data["token"]

def test_item_management_get_items_returns_active_by_default():
    # Login as admin and standard user
    admin_token = login("jose", "Password1")
    user_token = login("alix", "Password1")
    headers_admin = {"Authorization": f"Bearer {admin_token}"}
    headers_user = {"Authorization": f"Bearer {user_token}"}

    # GET /api/items without any query - expect only active items (default)
    url_items = f"{BASE_URL}/api/items"
    resp = requests.get(url_items, headers=headers_admin, timeout=TIMEOUT)
    assert resp.status_code == 200, f"Expected 200 but got {resp.status_code}"
    data = resp.json()
    assert isinstance(data, dict)
    assert "items" in data
    assert isinstance(data["items"], list)
    # All items returned should be active
    for item in data["items"]:
        assert "isActive" not in item or item["isActive"] == True

    # GET /api/items with ?all=true and admin token, returns all items including inactive
    resp_all = requests.get(f"{url_items}?all=true", headers=headers_admin, timeout=TIMEOUT)
    assert resp_all.status_code == 200, f"Expected 200 but got {resp_all.status_code}"
    data_all = resp_all.json()
    assert isinstance(data_all, dict)
    assert "items" in data_all
    assert isinstance(data_all["items"], list)
    # Expect to find at least one item whose isActive is false (to verify all included)
    has_inactive = any(item.get("isActive") is False for item in data_all["items"])
    assert has_inactive, "Expected to find inactive items when ?all=true is used by admin"

    # GET /api/items with ?all=true and standard user token, should return only active items (no admin privileges)
    resp_user_all = requests.get(f"{url_items}?all=true", headers=headers_user, timeout=TIMEOUT)
    assert resp_user_all.status_code == 200, f"Expected 200 but got {resp_user_all.status_code}"
    data_user_all = resp_user_all.json()
    assert isinstance(data_user_all, dict)
    assert "items" in data_user_all
    assert isinstance(data_user_all["items"], list)
    # Should contain only active items despite ?all=true due to non-admin
    for item in data_user_all["items"]:
        assert "isActive" not in item or item["isActive"] == True

test_item_management_get_items_returns_active_by_default()