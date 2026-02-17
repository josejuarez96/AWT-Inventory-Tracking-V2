import requests
import time

BASE_URL = "http://localhost:3000"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
LOGOUT_URL = f"{BASE_URL}/api/auth/logout"
USERNAME = "jose"
PASSWORD = "Password1"
TIMEOUT = 30
MAX_LOGIN_RETRIES = 3
LOGIN_RETRY_DELAY = 15  # seconds

def login_with_retry(username, password):
    """Attempt to login with retries on 429 status code due to rate limiting."""
    for attempt in range(1, MAX_LOGIN_RETRIES + 1):
        try:
            response = requests.post(
                LOGIN_URL,
                json={"username": username, "password": password},
                timeout=TIMEOUT,
            )
        except requests.RequestException as e:
            if attempt == MAX_LOGIN_RETRIES:
                raise
            else:
                time.sleep(LOGIN_RETRY_DELAY)
                continue

        if response.status_code == 200:
            data = response.json()
            token = data.get("token")
            if token:
                return token
            else:
                if attempt == MAX_LOGIN_RETRIES:
                    raise AssertionError("Login succeeded but token missing.")
                else:
                    time.sleep(LOGIN_RETRY_DELAY)
                    continue

        elif response.status_code == 429:
            if attempt == MAX_LOGIN_RETRIES:
                # After max retries on rate limit, assert failure
                raise AssertionError("Login rate limited after retries with 429 status.")
            else:
                time.sleep(LOGIN_RETRY_DELAY)

        elif response.status_code == 401:
            raise AssertionError("Login failed with invalid credentials.")

        else:
            if attempt == MAX_LOGIN_RETRIES:
                raise AssertionError(f"Unexpected login failure: {response.status_code} {response.text}")
            else:
                time.sleep(LOGIN_RETRY_DELAY)

    raise AssertionError("Failed to login after retries.")

def test_post_api_auth_logout_with_valid_token_returns_acknowledgement():
    token = login_with_retry(USERNAME, PASSWORD)

    headers = {
        "Authorization": f"Bearer {token}"
    }

    try:
        response = requests.post(LOGOUT_URL, headers=headers, timeout=TIMEOUT)
    except requests.RequestException as e:
        raise AssertionError(f"Request to logout endpoint failed: {e}")

    assert response.status_code == 200, f"Expected status 200 but got {response.status_code}. Response: {response.text}"

    json_response = response.json()
    assert isinstance(json_response, dict), "Response is not a JSON object."
    assert "message" in json_response, "Response JSON does not contain 'message' key."
    assert isinstance(json_response["message"], str), "'message' in response is not a string."
    assert len(json_response["message"].strip()) > 0, "'message' in response is empty."

test_post_api_auth_logout_with_valid_token_returns_acknowledgement()