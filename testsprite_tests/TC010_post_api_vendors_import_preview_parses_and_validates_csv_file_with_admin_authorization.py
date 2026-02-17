import requests
from io import BytesIO

BASE_URL = "http://localhost:3000"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
VENDORS_IMPORT_PREVIEW_URL = f"{BASE_URL}/api/vendors/import/preview"
TIMEOUT = 30


def test_post_api_vendors_import_preview_parses_and_validates_csv_file_with_admin_authorization():
    try:
        # Step 1: Authenticate as admin to get JWT token
        login_payload = {"username": "jose", "password": "password123"}
        login_resp = requests.post(LOGIN_URL, json=login_payload, timeout=TIMEOUT)
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        login_data = login_resp.json()
        token = login_data.get("token")
        assert token, "JWT token missing in login response"

        headers = {"Authorization": f"Bearer {token}"}

        # Step 2: Prepare a valid CSV file content for vendor import preview
        # Example CSV header and rows (header normalized by server):
        # vendor_code,vendor_name
        # VEND001,Vendor One
        # VEND002,Vendor Two
        # Including one row with an error to test validation error reporting
        csv_content = (
            "vendor_code,vendor_name\n"
            "VEND001,Vendor One\n"
            "VEND002,Vendor Two\n"
            "VEND003,\n"  # Missing vendor_name, expect validation error on this row
        )
        files = {
            "file": ("vendors.csv", BytesIO(csv_content.encode("utf-8")), "text/csv"),
        }

        # Step 3: POST /api/vendors/import/preview with multipart/form-data and Authorization
        resp = requests.post(
            VENDORS_IMPORT_PREVIEW_URL,
            headers=headers,
            files=files,
            timeout=TIMEOUT,
        )
        assert resp.status_code == 200, f"Expected 200 OK but got {resp.status_code}: {resp.text}"

        resp_json = resp.json()

        # Validate response JSON contains 'rows' and 'errors' keys
        assert "rows" in resp_json, "'rows' key missing in response JSON"
        assert "errors" in resp_json, "'errors' key missing in response JSON"

        rows = resp_json["rows"]
        errors = resp_json["errors"]

        # The server should parse 3 rows (including header is not counted in rows array),
        # so expect 3 rows total - but as per usual CSV upload, rows array corresponds to rows data (excluding header).
        # So it should have 3 rows.
        assert isinstance(rows, list), "'rows' is not a list"
        assert len(rows) == 3, f"Expected 3 rows parsed, got {len(rows)}"

        # Errors should include one entry for rowNumber 4 (since header is row 1, first data row is row 2)
        # The bad row vendor_name is missing (empty) in row 4 (counting header as 1)
        error_found = False
        for error in errors:
            if (
                isinstance(error, dict)
                and error.get("rowNumber") == 4
                and error.get("field") == "vendor_name"
            ):
                error_found = True
                assert isinstance(error.get("message"), str) and len(error["message"]) > 0, "Error message invalid"
        assert error_found, "Expected validation error for missing vendor_name at row 4 not found"

    except requests.RequestException as e:
        assert False, f"Request failed: {e}"


test_post_api_vendors_import_preview_parses_and_validates_csv_file_with_admin_authorization()