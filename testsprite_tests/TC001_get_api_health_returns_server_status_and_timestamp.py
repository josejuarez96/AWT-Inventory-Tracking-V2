import requests
from datetime import datetime

def test_get_api_health_returns_server_status_and_timestamp():
    url = "http://localhost:3000/api/health"
    timeout = 30
    try:
        response = requests.get(url, timeout=timeout)
    except requests.RequestException as e:
        assert False, f"Request to {url} failed: {e}"
    
    assert response.status_code == 200, f"Expected status code 200 but got {response.status_code}"
    
    try:
        data = response.json()
    except ValueError:
        assert False, "Response is not valid JSON"
    
    assert isinstance(data, dict), "Response JSON is not an object"
    assert data.get("status") == "ok", f"Expected status 'ok' but got {data.get('status')}"
    assert "API is running" in data.get("message", ""), f"Expected message containing 'API is running' but got {data.get('message')}"
    timestamp = data.get("timestamp")
    assert isinstance(timestamp, str), "Timestamp is not a string"
    try:
        # Validate ISO8601 format by parsing
        datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    except Exception:
        assert False, f"Timestamp '{timestamp}' is not a valid ISO8601 string"

test_get_api_health_returns_server_status_and_timestamp()
