import requests
import time

BASE_URL = "http://localhost:3000"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
TIMEOUT = 30

def test_post_api_auth_login_rate_limit_enforces_10_requests_per_minute_per_ip():
    username = "jose"
    password = "Password1"
    headers = {"Content-Type": "application/json"}

    max_attempts = 15
    too_many_attempts_received = False
    too_many_attempts_response_body = None

    for i in range(max_attempts):
        payload = {"username": username, "password": password}
        response = requests.post(LOGIN_URL, json=payload, headers=headers, timeout=TIMEOUT)
        if response.status_code == 429:
            too_many_attempts_received = True
            too_many_attempts_response_body = response.json()
            # The rate limit window is 15 seconds. Wait the window before continuing attempts.
            time.sleep(15)
            # After sleeping, retry this attempt once
            response_retry = requests.post(LOGIN_URL, json=payload, headers=headers, timeout=TIMEOUT)
            if response_retry.status_code == 429:
                too_many_attempts_response_body = response_retry.json()
                break
            else:
                continue
        elif response.status_code != 200:
            raise AssertionError(f"Login request {i+1} failed with status {response.status_code}")

    assert too_many_attempts_received, "Rate limit (429) was not triggered after exceeding 10 login requests"

    response_body = too_many_attempts_response_body
    message_hit = False
    if isinstance(response_body, dict):
        for key in ("message", "error", "detail"):
            if key in response_body and "too many login attempts" in response_body[key].lower():
                message_hit = True
                break
        if not message_hit:
            if "too many login attempts" in str(response_body).lower():
                message_hit = True
    else:
        if "too many login attempts" in str(response_body).lower():
            message_hit = True

    assert message_hit, "Response on 429 does not contain 'Too many login attempts' message"


test_post_api_auth_login_rate_limit_enforces_10_requests_per_minute_per_ip()