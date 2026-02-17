import requests

BASE_URL = "http://localhost:3000"
TIMEOUT = 30

def test_health_check_api_returns_server_status_and_timestamp():
    url = f"{BASE_URL}/api/health"
    try:
        response = requests.get(url, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Request to {url} failed: {e}"

    assert response.status_code == 200, f"Expected status code 200, got {response.status_code}"
    
    try:
        data = response.json()
    except ValueError:
        assert False, "Response is not in JSON format"

    for key in ["status", "message", "timestamp"]:
        assert key in data, f"Response JSON missing key: '{key}'"
        assert isinstance(data[key], str), f"Expected '{key}' to be a string"

test_health_check_api_returns_server_status_and_timestamp()