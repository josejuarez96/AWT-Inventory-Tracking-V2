import requests

BASE_URL = "http://localhost:3000"
LOGIN_ENDPOINT = "/api/auth/login"
DASHBOARD_ACTIVITY_ENDPOINT = "/api/dashboard/activity"
TIMEOUT = 30


def test_get_api_dashboard_activity_returns_recent_transactions_with_descriptions():
    # Authenticate to get JWT token
    login_url = BASE_URL + LOGIN_ENDPOINT
    login_payload = {"username": "jose", "password": "password123"}
    try:
        login_resp = requests.post(login_url, json=login_payload, timeout=TIMEOUT)
        assert login_resp.status_code == 200, f"Login failed with status {login_resp.status_code}"
        login_data = login_resp.json()
        token = login_data.get("token")
        assert isinstance(token, str) and token, "Token missing or invalid in login response"
    except Exception as e:
        raise AssertionError(f"Authentication failed: {e}")

    headers = {"Authorization": f"Bearer {token}"}
    activity_url = BASE_URL + DASHBOARD_ACTIVITY_ENDPOINT

    try:
        resp = requests.get(activity_url, headers=headers, timeout=TIMEOUT)
        assert resp.status_code == 200, f"Expected 200 OK but got {resp.status_code}"
        data = resp.json()

        assert "activity" in data, "Response JSON missing 'activity' key"
        activity = data["activity"]
        assert isinstance(activity, list), "'activity' is not a list"

        for i, item in enumerate(activity):
            assert isinstance(item, dict), f"Activity item at index {i} is not a dict"
            # id: number (int)
            assert "id" in item and isinstance(item["id"], int), f"Activity item {i} missing int id"
            # description: string
            assert "description" in item and isinstance(item["description"], str), f"Activity item {i} missing string description"
            # transactionType: string
            assert "transactionType" in item and isinstance(item["transactionType"], str), f"Activity item {i} missing string transactionType"
            # location: string
            assert "location" in item and isinstance(item["location"], str), f"Activity item {i} missing string location"

    except AssertionError:
        raise
    except Exception as e:
        raise AssertionError(f"Failed to get dashboard activity: {e}")


test_get_api_dashboard_activity_returns_recent_transactions_with_descriptions()