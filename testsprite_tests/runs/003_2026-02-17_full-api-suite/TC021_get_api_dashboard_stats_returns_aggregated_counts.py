import requests

BASE_URL = "http://localhost:3000"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
DASHBOARD_STATS_URL = f"{BASE_URL}/api/dashboard/stats"
TIMEOUT = 30


def test_get_api_dashboard_stats_returns_aggregated_counts():
    login_payload = {"username": "jose", "password": "password123"}

    try:
        # Authenticate and get JWT token
        login_resp = requests.post(LOGIN_URL, json=login_payload, timeout=TIMEOUT)
        assert login_resp.status_code == 200, f"Login failed with status {login_resp.status_code}"
        login_data = login_resp.json()
        token = login_data.get("token")
        assert token and isinstance(token, str), "Token missing or invalid in login response"

        headers = {"Authorization": f"Bearer {token}"}

        # Call GET /api/dashboard/stats with auth token
        resp = requests.get(DASHBOARD_STATS_URL, headers=headers, timeout=TIMEOUT)
        assert resp.status_code == 200, f"Expected 200 OK but got {resp.status_code}"
        data = resp.json()
        
        # Validate keys and types
        assert "totalItems" in data and isinstance(data["totalItems"], (int, float)), "totalItems missing or not a number"
        assert "transactionsMTD" in data and isinstance(data["transactionsMTD"], (int, float)), "transactionsMTD missing or not a number"
        assert "activeVendors" in data and isinstance(data["activeVendors"], (int, float)), "activeVendors missing or not a number"
        assert "teamMembers" in data and isinstance(data["teamMembers"], (int, float)), "teamMembers missing or not a number"

    except requests.RequestException as e:
        assert False, f"RequestException occurred: {e}"


test_get_api_dashboard_stats_returns_aggregated_counts()