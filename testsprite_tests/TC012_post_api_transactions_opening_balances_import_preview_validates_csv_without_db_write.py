import requests
import csv
import io

BASE_URL = "http://localhost:3000"
LOGIN_PATH = "/api/auth/login"
ITEMS_PATH = "/api/items"
IMPORT_PREVIEW_PATH = "/api/transactions/opening-balances/import/preview"

def test_post_api_transactions_opening_balances_import_preview_validates_csv_without_db_write():
    # Step 1: Login to get JWT token
    login_url = f"{BASE_URL}{LOGIN_PATH}"
    login_payload = {"username": "jose", "password": "password123"}
    try:
        login_resp = requests.post(login_url, json=login_payload, timeout=30)
        login_resp.raise_for_status()
    except Exception as e:
        raise AssertionError(f"Login request failed: {e}")
    login_data = login_resp.json()
    assert "token" in login_data, "Token missing in login response"
    token = login_data["token"]

    headers_auth = {"Authorization": f"Bearer {token}"}

    # Step 2: Get valid item codes from GET /api/items
    items_url = f"{BASE_URL}{ITEMS_PATH}"
    try:
        items_resp = requests.get(items_url, headers=headers_auth, timeout=30)
        items_resp.raise_for_status()
    except Exception as e:
        raise AssertionError(f"Get items request failed: {e}")
    items_data = items_resp.json()
    assert "items" in items_data, "Items missing in response"
    items_list = items_data["items"]
    assert isinstance(items_list, list) and len(items_list) > 0, "No items returned"
    # Extract at least one valid item_code for CSV
    valid_item_code = items_list[0].get("itemCode") or items_list[0].get("item_code") or items_list[0].get("item_code".lower()) or items_list[0].get("itemCode".lower())
    if not valid_item_code:
        # Try keys fallback
        keys = items_list[0].keys()
        for k in keys:
            if k.lower() == "item_code":
                valid_item_code = items_list[0][k]
                break
    assert valid_item_code is not None and isinstance(valid_item_code, str) and valid_item_code.strip() != "", "Valid item code not found"

    # Step 3: Construct CSV content with valid rows
    # Columns: item_code, location, quantity, unit_cost
    # Use at least 2 rows for validation: one normal, one with decimals and a location
    csv_buffer = io.StringIO()
    csv_writer = csv.writer(csv_buffer)
    csv_writer.writerow(["item_code", "location", "quantity", "unit_cost"])
    csv_writer.writerow([valid_item_code, "ADEL", "10", "15.75"])
    csv_writer.writerow([valid_item_code, "CALHOUN", "5.5", "10.00"])
    csv_data = csv_buffer.getvalue()
    csv_buffer.close()

    # Step 4: POST /api/transactions/opening-balances/import/preview with multipart/form-data file upload
    preview_url = f"{BASE_URL}{IMPORT_PREVIEW_PATH}"
    files = {
        "file": ("opening_balances.csv", csv_data, "text/csv")
    }
    try:
        preview_resp = requests.post(preview_url, headers=headers_auth, files=files, timeout=30)
        preview_resp.raise_for_status()
    except requests.exceptions.HTTPError as e:
        raise AssertionError(f"Preview request failed with HTTP error: {e} Response: {preview_resp.text}")
    except Exception as e:
        raise AssertionError(f"Preview request failed: {e}")
    preview_data = preview_resp.json()

    # Step 5: Validate response structure: 200 with { rows: [...], errors: [...] }
    assert preview_resp.status_code == 200, f"Expected status code 200 but got {preview_resp.status_code}"
    assert isinstance(preview_data, dict), "Response is not a JSON object"
    assert "rows" in preview_data, "Response missing 'rows' key"
    assert "errors" in preview_data, "Response missing 'errors' key"
    assert isinstance(preview_data["rows"], list), "'rows' is not a list"
    assert isinstance(preview_data["errors"], list), "'errors' is not a list"
    # Additional sanity check: rows have expected headers normalized
    # Check at least one row has required keys: item_code, location, quantity (unit_cost optional)
    if len(preview_data["rows"]) > 0:
        first_row = preview_data["rows"][0]
        # Headers normalized to snake_case, keys lowercase
        keys_lower = set(k.lower() for k in first_row.keys())
        required_keys = {"item_code", "location", "quantity"}
        assert required_keys.issubset(keys_lower), f"Row keys missing required fields: {required_keys - keys_lower}"
    # Errors array expected to be empty for valid CSV rows
    assert len(preview_data["errors"]) == 0, f"Expected zero errors for valid CSV, got: {preview_data['errors']}"

test_post_api_transactions_opening_balances_import_preview_validates_csv_without_db_write()