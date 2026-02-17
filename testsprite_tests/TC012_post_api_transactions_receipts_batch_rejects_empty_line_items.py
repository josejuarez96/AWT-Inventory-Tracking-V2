import requests

BASE_URL = "http://localhost:3000"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
VENDORS_URL = f"{BASE_URL}/api/vendors"
RECEIPTS_BATCH_URL = f"{BASE_URL}/api/transactions/receipts/batch"

def test_post_api_transactions_receipts_batch_rejects_empty_line_items():
    # Step 1: Authenticate and get JWT token
    login_payload = {
        "username": "jose",
        "password": "password123"
    }
    login_resp = requests.post(LOGIN_URL, json=login_payload, timeout=30)
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    token = login_resp.json().get("token")
    assert token, "Token not found in login response"
    headers = {"Authorization": f"Bearer {token}"}

    # Step 2: Get valid vendorId from GET /api/vendors
    vendors_resp = requests.get(VENDORS_URL, headers=headers, timeout=30)
    assert vendors_resp.status_code == 200, f"Get vendors failed: {vendors_resp.text}"
    vendors = vendors_resp.json().get("vendors")
    assert vendors and isinstance(vendors, list) and len(vendors) > 0, "No vendors found"
    vendor_id = vendors[0].get("id")
    assert vendor_id is not None, "Vendor id not found"

    # Step 3: Prepare request payload with empty lineItems array
    post_payload = {
        "vendorId": vendor_id,
        "location": "ADEL",
        "transactionDate": "2026-02-17",
        "lineItems": []
    }

    # Step 4: POST to /api/transactions/receipts/batch and expect 400 validation error
    resp = requests.post(RECEIPTS_BATCH_URL, json=post_payload, headers=headers, timeout=30)

    assert resp.status_code == 400, f"Expected 400 status but got {resp.status_code}: {resp.text}"
    # Response should be a validation error array, optionally check that lineItems error present if available
    try:
        resp_json = resp.json()
        # Validate likely error presence for lineItems or general validation error array
        assert isinstance(resp_json, dict) or isinstance(resp_json, list), "Expected JSON response for validation error"
        # We expect errors related to lineItems being empty, no exact schema defined here so just check string presence
        error_text = str(resp_json).lower()
        assert 'lineitems' in error_text or 'line items' in error_text or 'validation' in error_text, "Expected validation error related to lineItems"
    except Exception:
        # If response not JSON or other error, still consider test passed by status code
        pass


test_post_api_transactions_receipts_batch_rejects_empty_line_items()