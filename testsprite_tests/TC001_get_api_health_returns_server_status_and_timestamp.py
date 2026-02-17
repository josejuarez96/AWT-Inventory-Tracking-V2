import requests
from datetime import datetime
import re

BASE_URL = "http://localhost:3002"
HEALTH_ENDPOINT = "/api/health"
TIMEOUT = 30

def test_get_api_health_returns_server_status_and_timestamp():
    url = BASE_URL + HEALTH_ENDPOINT
    try:
        response = requests.get(url, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Request to {url} failed: {e}"

    assert response.status_code == 200, f"Expected HTTP 200 but got {response.status_code}"
    try:
        body = response.json()
    except ValueError:
        assert False, "Response is not valid JSON"

    # Validate required keys
    expected_keys = {'status', 'message', 'timestamp'}
    assert expected_keys <= body.keys(), f"Response JSON missing keys. Expected keys: {expected_keys}, got keys: {body.keys()}"

    assert body['status'] == 'ok', f"Expected status 'ok' but got '{body['status']}'"
    assert isinstance(body['message'], str) and len(body['message']) > 0, "Message should be a non-empty string"

    # Validate ISO 8601 timestamp
    timestamp = body['timestamp']
    # ISO 8601 regex pattern (basic check)
    iso8601_regex = (
        r'^(-?(?:[1-9][0-9]*)?[0-9]{4})'   # year
        r'-(1[0-2]|0[1-9])'                # month
        r'-(3[01]|0[1-9]|[12][0-9])'      # day
        r'T(2[0-3]|[01][0-9])'             # hour
        r':([0-5][0-9])'                   # minute
        r':([0-5][0-9]|60)'                # second
        r'(?:\.(\d+))?'                   # fractional seconds
        r'(Z|[+-](?:2[0-3]|[01][0-9]):[0-5][0-9])?$'  # timezone
    )
    assert re.match(iso8601_regex, timestamp), f"Timestamp is not valid ISO 8601 format: {timestamp}"

    # Extra check: try parsing timestamp with datetime.fromisoformat (Python 3.7+)
    try:
        # Remove Z for fromisoformat which expects +00:00 or none
        parse_timestamp = timestamp.rstrip('Z')
        # If endswith Z, replace it with +00:00 for parsing
        if timestamp.endswith('Z'):
            parse_timestamp = timestamp[:-1] + '+00:00'
        datetime.fromisoformat(parse_timestamp)
    except Exception as e:
        assert False, f"Timestamp is not a valid ISO 8601 datetime: {timestamp}, error: {e}"

test_get_api_health_returns_server_status_and_timestamp()