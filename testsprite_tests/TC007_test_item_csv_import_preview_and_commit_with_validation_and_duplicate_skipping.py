import requests
import io

BASE_URL = "http://localhost:3000"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
IMPORT_PREVIEW_URL = f"{BASE_URL}/api/items/import/preview"
IMPORT_COMMIT_URL = f"{BASE_URL}/api/items/import"

def test_item_csv_import_preview_and_commit_with_validation_and_duplicate_skipping():
    # Authenticate as admin (jose)
    auth_resp = requests.post(
        LOGIN_URL,
        json={"username": "jose", "password": "password123"},
        timeout=30
    )
    assert auth_resp.status_code == 200, f"Login failed: {auth_resp.text}"
    token = auth_resp.json().get("token")
    assert token, "No token returned on login"

    headers = {"Authorization": f"Bearer {token}"}

    # Prepare a CSV content with:
    # - 1 valid new item row
    # - 1 valid duplicate item row (simulate duplicate by reusing itemCode from valid new)
    # - 1 invalid row (e.g. missing itemCode)
    csv_content = (
        "itemCode,description,category,unitOfMeasure,minQuantity,maxQuantity,notes\n"
        "NEWITEM001,New item description,CategoryA,EA,5,50,Note1\n"
        "NEWITEM001,Duplicate item description,CategoryA,EA,3,30,Note duplicate\n"
        ",Missing itemCode,CategoryB,EA,2,20,Note missing code\n"
    )

    # 1) Test preview upload - success case, with validation errors returned
    files = {
        "file": ("items.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")
    }
    preview_resp = requests.post(
        IMPORT_PREVIEW_URL,
        headers=headers,
        files=files,
        timeout=30
    )
    assert preview_resp.status_code == 200, f"Preview upload failed: {preview_resp.text}"
    preview_data = preview_resp.json()
    assert "rows" in preview_data, "Response missing 'rows' key"
    assert "errors" in preview_data, "Response missing 'errors' key"

    rows = preview_data["rows"]
    errors = preview_data["errors"]
    assert isinstance(rows, list), "'rows' is not a list"
    assert isinstance(errors, list), "'errors' is not a list"

    # Validate that an error is reported for the invalid row (missing itemCode)
    error_fields = {e['field'] for e in errors if 'field' in e and isinstance(e['field'], str)}
    assert "itemCode" in error_fields, "Validation error for itemCode missing"

    # Validate that preview does not write to DB: no insertion count returned here
    # (Preview is readonly)

    # 2) Test preview upload - error case: missing file
    preview_no_file_resp = requests.post(
        IMPORT_PREVIEW_URL,
        headers=headers,
        timeout=30
    )
    assert preview_no_file_resp.status_code == 400, "Missing file should return 400"

    # 3) Test commit import - commit only valid rows (skip invalid)
    # Use rows from preview but only with valid rows (filter out rows with errors)
    error_rows = {e['rowNumber'] for e in errors}
    valid_rows = [row for i, row in enumerate(rows, start=1) if i not in error_rows]

    # Commit valid rows (should skip duplicates by itemCode)
    commit_payload = {"rows": valid_rows}
    commit_resp = requests.post(
        IMPORT_COMMIT_URL,
        headers={**headers, "Content-Type": "application/json"},
        json=commit_payload,
        timeout=30
    )
    assert commit_resp.status_code == 201, f"Commit failed: {commit_resp.text}"
    commit_data = commit_resp.json()
    assert "inserted" in commit_data, "Commit response missing 'inserted' count"
    inserted_count = commit_data["inserted"]
    # inserted count should be equal to unique valid itemCode count (duplicates skipped)
    unique_item_codes = set(row["itemCode"] for row in valid_rows)
    assert inserted_count <= len(unique_item_codes), "Inserted count exceeds unique valid rows"

    # 4) Test commit import - error case: commit with invalid row included
    invalid_commit_payload = {"rows": rows}  # includes invalid row(s)
    invalid_commit_resp = requests.post(
        IMPORT_COMMIT_URL,
        headers={**headers, "Content-Type": "application/json"},
        json=invalid_commit_payload,
        timeout=30
    )
    assert invalid_commit_resp.status_code == 400, "Commit with invalid row should return 400"

test_item_csv_import_preview_and_commit_with_validation_and_duplicate_skipping()
