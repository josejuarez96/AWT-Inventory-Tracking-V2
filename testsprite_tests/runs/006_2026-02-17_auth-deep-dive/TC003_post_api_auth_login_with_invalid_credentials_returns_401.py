import requests

BASE_URL = "http://localhost:3000"
LOGIN_ENDPOINT = "/api/auth/login"
TIMEOUT = 30

def test_post_api_auth_login_with_invalid_credentials_returns_401_or_400_or_429():
    url = BASE_URL + LOGIN_ENDPOINT
    invalid_credentials_401 = [
        {"username": "wronguser", "password": "Password1"},
        {"username": "jose", "password": "WrongPass"},
        {"username": "invaliduser", "password": "invalidpass"}
    ]
    invalid_credentials_400 = [
        {"username": "", "password": ""},
        {"username": "jose", "password": ""}
    ]
    headers = {
        "Content-Type": "application/json"
    }
    # Test cases expecting 401 or 429
    for creds in invalid_credentials_401:
        try:
            response = requests.post(url, json=creds, headers=headers, timeout=TIMEOUT)
        except requests.RequestException as e:
            assert False, f"Request failed: {e}"
        if response.status_code == 429:
            try:
                data = response.json()
            except Exception:
                assert False, "Response is not valid JSON"
            message = data.get("message") or data.get("error") or data.get("detail") or ""
            assert "Too many login attempts" in message, f"Expected 'Too many login attempts' message for 429, got: {message}"
            continue
        assert response.status_code == 401, f"Expected 401 or 429, got {response.status_code} for creds {creds}"
        try:
            data = response.json()
        except Exception:
            assert False, "Response is not valid JSON"
        message = (
            data.get("message") or
            data.get("error") or
            data.get("detail") or
            ""
        )
        assert "Invalid credentials" in message, f"Expected 'Invalid credentials' message, got: {message}"
    # Test cases expecting 400
    for creds in invalid_credentials_400:
        try:
            response = requests.post(url, json=creds, headers=headers, timeout=TIMEOUT)
        except requests.RequestException as e:
            assert False, f"Request failed: {e}"
        assert response.status_code == 400, f"Expected 400, got {response.status_code} for creds {creds}"
        try:
            data = response.json()
        except Exception:
            assert False, "Response is not valid JSON"
        # Validation error expected as array or object
        assert "errors" in data or isinstance(data, dict), f"Expected validation error in response, got: {data}"

test_post_api_auth_login_with_invalid_credentials_returns_401_or_400_or_429()
