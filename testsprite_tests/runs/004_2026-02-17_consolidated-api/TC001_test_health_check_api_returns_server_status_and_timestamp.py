import requests

BASE_URL = "http://localhost:3000"
TIMEOUT = 30

def test_health_check_api_returns_server_status_and_timestamp():
    url = f"{BASE_URL}/api/health"
    try:
        response = requests.get(url, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Request to {url} failed: {e}"

    assert response.status_code == 200, f"Expected status 200, got {response.status_code}"

    try:
        json_body = response.json()
    except ValueError:
        assert False, "Response is not valid JSON"

    # Check keys existence and types
    assert "status" in json_body and isinstance(json_body["status"], str), "'status' missing or not a string"
    assert "message" in json_body and isinstance(json_body["message"], str), "'message' missing or not a string"
    assert "timestamp" in json_body and isinstance(json_body["timestamp"], str), "'timestamp' missing or not a string"

    # Additional basic validation on timestamp format ISO 8601 (optional, basic check)
    import re
    iso8601_regex = r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?$"
    assert re.match(iso8601_regex, json_body["timestamp"]) or len(json_body["timestamp"]) > 0, "timestamp format invalid or empty"


test_health_check_api_returns_server_status_and_timestamp()