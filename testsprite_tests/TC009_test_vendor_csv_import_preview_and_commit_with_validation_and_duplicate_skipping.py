import requests
import io
import csv

BASE_URL = "http://localhost:3000"
LOGIN_ENDPOINT = "/api/auth/login"
IMPORT_PREVIEW_ENDPOINT = "/api/vendors/import/preview"
IMPORT_COMMIT_ENDPOINT = "/api/vendors/import"

def test_vendor_csv_import_preview_and_commit_with_validation_and_duplicate_skipping():
    session = requests.Session()
    timeout = 30

    # Step 1: Authenticate as admin user to get JWT token
    login_payload = {"username": "jose", "password": "password123"}
    login_resp = session.post(
        BASE_URL + LOGIN_ENDPOINT, json=login_payload, timeout=timeout
    )
    assert login_resp.status_code == 200, "Login failed"
    login_json = login_resp.json()
    token = login_json.get("token")
    assert token, "No token returned from login"

    headers_auth = {"Authorization": f"Bearer {token}"}

    # Prepare CSV content for preview: include valid and invalid rows and duplicates
    # Columns based on typical vendor fields: vendorCode, vendorName, contactPerson, phone, email, paymentTerms, notes
    # One invalid row missing vendorCode (required)
    # One duplicate vendorCode row (simulate later commit skipping duplicates)

    csv_content = """vendorCode,vendorName,contactPerson,phone,email,paymentTerms,notes
VEND001,Vendor One,John Doe,123-456-7890,john@vendor1.com,Net 30,First vendor
VEND002,Vendor Two,Jane Smith,234-567-8901,jane@vendor2.com,Net 45,Second vendor
,Vendor Missing Code,,345-678-9012,missing@vendor.com,Net 60,Invalid missing code
VEND001,Vendor Duplicate,Jim Beam,456-789-0123,jim@vendordup.com,Net 30,Duplicate vendor code
"""

    # Step 2: POST to /api/vendors/import/preview with multipart/form-data file field 'file'
    files = {
        "file": ("vendors.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv"),
    }
    response_preview = session.post(
        BASE_URL + IMPORT_PREVIEW_ENDPOINT, headers=headers_auth, files=files, timeout=timeout
    )
    assert response_preview.status_code == 200, f"Preview upload failed with {response_preview.status_code}"
    preview_json = response_preview.json()
    assert "rows" in preview_json, "No rows key in preview response"
    assert "errors" in preview_json, "No errors key in preview response"

    rows = preview_json["rows"]
    errors = preview_json["errors"]

    # Validate that errors correspond to missing vendorCode in row 4 (1-based counting includes header)
    assert any(e.get("field") == "vendorCode" and e.get("rowNumber") == 4 for e in errors), "Missing validation error for vendorCode at row 4"

    # Extract validated rows (usually those without errors) for commit
    # For simplicity, commit only rows without vendorCode error and only unique vendorCodes
    valid_rows = [row for row in rows if row.get("vendorCode") and row.get("vendorCode").strip() != ""]

    # Step 3: POST to /api/vendors/import commit endpoint with validated rows
    # Commit should insert valid unique vendors and skip duplicates

    commit_payload = {"rows": valid_rows}
    response_commit = session.post(
        BASE_URL + IMPORT_COMMIT_ENDPOINT, headers={**headers_auth, "Content-Type": "application/json"}, json=commit_payload, timeout=timeout
    )
    assert response_commit.status_code == 201, f"Commit failed with status {response_commit.status_code}"
    commit_json = response_commit.json()
    assert "inserted" in commit_json, "No inserted count returned"

    inserted_count = commit_json["inserted"]
    # Validate inserted count is equal to number of unique valid vendorCode rows (excluding duplicate VEND001)
    unique_vendor_codes = {row["vendorCode"] for row in valid_rows}
    assert inserted_count <= len(unique_vendor_codes), "Inserted count greater than unique valid vendorCodes"

    # Step 4: Error handling for missing file on preview
    response_preview_no_file = session.post(
        BASE_URL + IMPORT_PREVIEW_ENDPOINT, headers=headers_auth, files={}, timeout=timeout
    )
    assert response_preview_no_file.status_code == 400, "Missing file error not returned"
    if response_preview_no_file.headers.get("Content-Type", "").startswith("application/json"):
        json_resp = response_preview_no_file.json()
        assert "no file" in str(json_resp).lower() or "parse error" in str(json_resp).lower(), "Incorrect error message for missing file"

    # Step 5: Error handling for commit with invalid rows (e.g. empty vendorCode)
    invalid_commit_payload = {"rows": [{"vendorCode": "", "vendorName": "Invalid Vendor"}]}
    response_commit_invalid = session.post(
        BASE_URL + IMPORT_COMMIT_ENDPOINT, headers={**headers_auth, "Content-Type": "application/json"}, json=invalid_commit_payload, timeout=timeout
    )
    assert response_commit_invalid.status_code == 400, "Validation error on commit not returned for invalid rows"

test_vendor_csv_import_preview_and_commit_with_validation_and_duplicate_skipping()
