import requests
import time

BASE_URL = "http://localhost:3002/api"
TIMEOUT = 30

def test_workflow_dashboard_and_reporting_data_accuracy():
    # Step 1: Login as user (alix/Password1)
    login_payload = {"username": "alix", "password": "Password1"}
    login_resp = requests.post(f"{BASE_URL}/auth/login", json=login_payload, timeout=TIMEOUT)
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    token = login_resp.json().get("token")
    assert token, "No token returned in login response"
    headers = {"Authorization": f"Bearer {token}"}

    time.sleep(2)

    # Step 2: GET /api/dashboard/stats
    resp = requests.get(f"{BASE_URL}/dashboard/stats", headers=headers, timeout=TIMEOUT)
    assert resp.status_code == 200, f"Dashboard stats failed: {resp.text}"
    stats = resp.json()
    # Validate numbers and totalItems > 0
    assert isinstance(stats.get("totalItems"), (int, float)) and stats["totalItems"] > 0, "Invalid totalItems"
    assert isinstance(stats.get("transactionsMTD"), (int, float)), "Invalid transactionsMTD"
    assert isinstance(stats.get("activeVendors"), (int, float)), "Invalid activeVendors"
    assert isinstance(stats.get("teamMembers"), (int, float)), "Invalid teamMembers"
    assert isinstance(stats.get("overstockCount"), (int, float)), "Invalid overstockCount"

    time.sleep(2)

    # Step 3: GET /api/dashboard/low-stock
    resp = requests.get(f"{BASE_URL}/dashboard/low-stock", headers=headers, timeout=TIMEOUT)
    assert resp.status_code == 200, f"Dashboard low-stock failed: {resp.text}"
    low_stock = resp.json()
    assert isinstance(low_stock.get("items"), list), "Low-stock items not a list"
    for item in low_stock["items"]:
        # Each item should have stock info and burn rate (burnRate, daysRemaining, stock fields may vary but must exist)
        assert "burnRate" in item or "burn_rate" in item, "Low-stock item missing burn rate"
        # We check typical stock info fields presence, one or more from possible keys
        stock_keys = ["stock", "quantity", "currentStock", "stockQty"]
        assert any(k in item for k in stock_keys), "Low-stock item missing stock info"

    time.sleep(2)

    # Step 4: GET /api/dashboard/dead-stock
    resp = requests.get(f"{BASE_URL}/dashboard/dead-stock", headers=headers, timeout=TIMEOUT)
    assert resp.status_code == 200, f"Dashboard dead-stock failed: {resp.text}"
    dead_stock = resp.json()
    assert isinstance(dead_stock.get("items"), list), "Dead-stock items not a list"

    time.sleep(2)

    # Step 5: GET /api/dashboard/valuation
    resp = requests.get(f"{BASE_URL}/dashboard/valuation", headers=headers, timeout=TIMEOUT)
    assert resp.status_code == 200, f"Dashboard valuation failed: {resp.text}"
    valuation = resp.json()
    adel = valuation.get("adel")
    calhoun = valuation.get("calhoun")
    total = valuation.get("total")
    for val in [adel, calhoun, total]:
        assert isinstance(val, (int, float)), "Valuation field not a number"
    # total = adel + calhoun (float tolerance)
    assert abs(total - (adel + calhoun)) < 0.0001, "Valuation total does not equal adel + calhoun"

    time.sleep(2)

    # Step 6: GET /api/dashboard/activity
    resp = requests.get(f"{BASE_URL}/dashboard/activity", headers=headers, timeout=TIMEOUT)
    assert resp.status_code == 200, f"Dashboard activity failed: {resp.text}"
    activity = resp.json()
    assert isinstance(activity.get("activity"), list), "Activity not a list"
    assert len(activity["activity"]) <= 20, "Activity list too long"

    time.sleep(2)

    # Step 7: GET /api/transactions?page=1&limit=10
    params = {"page": 1, "limit": 10}
    resp = requests.get(f"{BASE_URL}/transactions", headers=headers, params=params, timeout=TIMEOUT)
    assert resp.status_code == 200, f"Transactions listing failed: {resp.text}"
    tx_data = resp.json()
    assert isinstance(tx_data.get("transactions"), list), "Transactions field missing or not list"
    assert isinstance(tx_data.get("total"), (int, float)), "Total field missing or invalid"
    assert isinstance(tx_data.get("page"), int) and tx_data["page"] == 1, "Page field invalid"
    assert isinstance(tx_data.get("limit"), int) and tx_data["limit"] == 10, "Limit field invalid"
    assert isinstance(tx_data.get("totalPages"), (int, float)), "totalPages field missing or invalid"

    time.sleep(2)

    # Step 8: GET /api/transactions?type=RECEIPT -> verify only RECEIPT type transactions returned
    resp = requests.get(f"{BASE_URL}/transactions", headers=headers, params={"type": "RECEIPT"}, timeout=TIMEOUT)
    assert resp.status_code == 200, f"Transactions with type=RECEIPT failed: {resp.text}"
    txs = resp.json()
    assert isinstance(txs.get("transactions"), list), "Transactions missing or not list"
    for tx in txs["transactions"]:
        tx_type = tx.get("type") or tx.get("transactionType")
        assert tx_type is not None and tx_type == "RECEIPT", f"Non-RECEIPT transaction found: {tx_type}"

    time.sleep(2)

    # Step 9: GET /api/transactions?location=ADEL -> verify all returned transactions are at ADEL
    resp = requests.get(f"{BASE_URL}/transactions", headers=headers, params={"location": "ADEL"}, timeout=TIMEOUT)
    assert resp.status_code == 200, f"Transactions with location=ADEL failed: {resp.text}"
    txs = resp.json()
    assert isinstance(txs.get("transactions"), list), "Transactions missing or not list"
    for tx in txs["transactions"]:
        assert tx.get("location") == "ADEL", f"Transaction with wrong location found: {tx.get('location')}"

    time.sleep(2)

    # Step 10: GET /api/dashboard/stats without Authorization header -> verify 401
    resp = requests.get(f"{BASE_URL}/dashboard/stats", timeout=TIMEOUT)
    assert resp.status_code == 401, f"Expected 401 for unauthorized dashboard stats, got {resp.status_code}"

test_workflow_dashboard_and_reporting_data_accuracy()
