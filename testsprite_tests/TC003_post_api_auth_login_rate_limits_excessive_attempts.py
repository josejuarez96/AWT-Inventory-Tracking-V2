import requests
from time import time

BASE_URL = "http://localhost:3002"
LOGIN_ENDPOINT = "/api/auth/login"
TIMEOUT = 30

def test_post_api_auth_login_rate_limits_excessive_attempts():
    url = BASE_URL + LOGIN_ENDPOINT
    headers = {"Content-Type": "application/json"}
    payload = {
        "username": "alix",
        "password": "Password1"
    }

    # We will perform 11 requests in rapid succession to exceed rate limit of 10 per 15 seconds
    max_attempts = 11
    responses = []
    start_time = time()
    for i in range(max_attempts):
        try:
            resp = requests.post(url, json=payload, headers=headers, timeout=TIMEOUT)
            responses.append(resp)
        except requests.RequestException as e:
            # Append None to keep indexes aligned, but fail immediately since this is unexpected
            assert False, f"Request failed unexpectedly on attempt {i+1}: {e}"

    duration = time() - start_time
    # Assert that we did not exceed 15 seconds for test to keep in limit window (tests rate limiting accurately)
    assert duration <= 15, f"Test duration exceeded 15 seconds window: {duration}s"

    # Analyze responses: first 10 should be either 200 or 429 (if early rate limit triggered)
    for i in range(10):
        resp = responses[i]
        assert resp is not None, f"Response {i+1} is None"
        if resp.status_code == 429:
            # If rate limited earlier than 11th, valid test, no need to check further
            break
        else:
            assert resp.status_code == 200, f"Expected 200 or 429 but got {resp.status_code} at attempt {i+1}"

    # From 11th request onward, expect at least one 429
    rate_limit_triggered = any(r.status_code == 429 for r in responses[10:])
    assert rate_limit_triggered, f"Expected at least one 429 Too Many Requests response after 10 attempts, but none found"

    # Optionally check response content has suitable error message for 429
    for resp in responses:
        if resp.status_code == 429:
            try:
                json_body = resp.json()
                if "message" in json_body:
                    assert isinstance(json_body["message"], str) and len(json_body["message"]) > 0, "429 response missing message string"
            except Exception:
                pass  # If no JSON or no message, we do not fail the test on this

test_post_api_auth_login_rate_limits_excessive_attempts()
