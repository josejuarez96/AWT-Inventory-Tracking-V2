import requests

BASE_URL = "http://localhost:3000"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
DASHBOARD_VALUATION_URL = f"{BASE_URL}/api/dashboard/valuation"
TIMEOUT = 30

def test_get_api_dashboard_valuation_returns_inventory_value_by_location():
    # Step 1: Authenticate and get JWT token
    login_payload = {"username": "jose", "password": "password123"}
    try:
        login_resp = requests.post(LOGIN_URL, json=login_payload, timeout=TIMEOUT)
        assert login_resp.status_code == 200, f"Login failed with status {login_resp.status_code}"
        token = login_resp.json().get("token")
        assert token and isinstance(token, str), "No token received in login response"
    except requests.RequestException as e:
        assert False, f"Login request failed: {e}"

    headers = {"Authorization": f"Bearer {token}"}

    # Step 2: Call GET /api/dashboard/valuation with auth token
    try:
        resp = requests.get(DASHBOARD_VALUATION_URL, headers=headers, timeout=TIMEOUT)
        assert resp.status_code == 200, f"Expected status 200 but got {resp.status_code}"
        data = resp.json()
    except requests.RequestException as e:
        assert False, f"Dashboard valuation request failed: {e}"

    # Step 3: Validate the response fields and values
    assert "adel" in data, "'adel' key missing in response"
    assert "calhoun" in data, "'calhoun' key missing in response"
    assert "total" in data, "'total' key missing in response"

    adel = data["adel"]
    calhoun = data["calhoun"]
    total = data["total"]

    assert isinstance(adel, (int, float)), f"'adel' is not a number: {adel}"
    assert isinstance(calhoun, (int, float)), f"'calhoun' is not a number: {calhoun}"
    assert isinstance(total, (int, float)), f"'total' is not a number: {total}"

    calculated_total = adel + calhoun
    # Allow minor floating point tolerance
    assert abs(calculated_total - total) < 0.0001, f"Total {total} does not equal adel + calhoun ({calculated_total})"

test_get_api_dashboard_valuation_returns_inventory_value_by_location()