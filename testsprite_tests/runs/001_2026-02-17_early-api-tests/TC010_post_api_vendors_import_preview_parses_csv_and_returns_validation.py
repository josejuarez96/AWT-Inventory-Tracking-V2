import requests
from io import BytesIO

BASE_URL = "http://localhost:3000"


def test_post_api_vendors_import_preview_parses_csv_and_returns_validation():
    # Step 1: Login as admin to get token
    login_url = f"{BASE_URL}/api/auth/login"
    login_payload = {"username": "admin", "password": "admin123"}
    login_resp = requests.post(login_url, json=login_payload, timeout=30)
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    token = login_resp.json().get("token")
    assert token, "No token received from login"

    headers = {"Authorization": f"Bearer {token}"}

    import_preview_url = f"{BASE_URL}/api/vendors/import/preview"

    # Step 2: Test valid CSV file upload with multipart/form-data field 'file'
    # Prepare a valid CSV content, minimal valid data example (vendor_code, vendor_name)
    csv_content = (
        "vendor_code,vendor_name\n"
        "VEND001,Vendor One\n"
        "VEND002,Vendor Two\n"
    ).encode("utf-8")

    files = {"file": ("vendors.csv", BytesIO(csv_content), "text/csv")}

    resp = requests.post(import_preview_url, headers=headers, files=files, timeout=30)
    assert resp.status_code == 200, f"Expected 200 on valid CSV upload, got {resp.status_code}: {resp.text}"

    resp_json = resp.json()
    assert "rows" in resp_json, "Response JSON missing 'rows'"
    assert isinstance(resp_json["rows"], list), "'rows' should be a list"
    assert "errors" in resp_json, "Response JSON missing 'errors'"
    assert isinstance(resp_json["errors"], list), "'errors' should be a list"

    # Step 3: Test no file upload to receive 400 error
    resp_no_file = requests.post(import_preview_url, headers=headers, timeout=30)
    assert resp_no_file.status_code == 400, f"Expected 400 with no file upload, got {resp_no_file.status_code}"

    # Optionally check error message in response JSON
    try:
        error_json = resp_no_file.json()
        # The error message might be generic or specific
        # Just ensure an error message or similar present
        assert any(
            key in error_json for key in ["error", "message", "errors"]
        ), "Error response missing error message or details"
    except Exception:
        # Some servers may return empty body or non-JSON on error, ignore in that case
        pass


test_post_api_vendors_import_preview_parses_csv_and_returns_validation()