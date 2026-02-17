import requests
from datetime import datetime

BASE_URL = "http://localhost:3000"
TIMEOUT = 30

def test_health_check_api_returns_status_and_timestamp():
    url = f"{BASE_URL}/api/health"
    try:
        response = requests.get(url, timeout=TIMEOUT)
    except Exception as e:
        assert False, f"Request to /api/health failed with exception: {e}"

    assert response.status_code == 200, f"Expected status code 200 but got {response.status_code}"

    try:
        json_response = response.json()
    except Exception:
        assert False, "Response is not valid JSON"

    # Validate required keys exist and are of correct type
    assert "status" in json_response, "Response JSON missing 'status' key"
    assert isinstance(json_response["status"], str), "'status' is not a string"

    assert "message" in json_response, "Response JSON missing 'message' key"
    assert isinstance(json_response["message"], str), "'message' is not a string"

    assert "timestamp" in json_response, "Response JSON missing 'timestamp' key"
    assert isinstance(json_response["timestamp"], str), "'timestamp' is not a string"

    # Validate timestamp is a valid ISO 8601 datetime string (basic check)
    try:
        _ = datetime.fromisoformat(json_response["timestamp"].replace("Z", "+00:00"))
    except Exception:
        assert False, f"timestamp value is not a valid ISO 8601 datetime string: {json_response['timestamp']}"

    # Optionally check status and message non-empty
    assert json_response["status"], "Status string is empty"
    assert json_response["message"], "Message string is empty"


test_health_check_api_returns_status_and_timestamp()
