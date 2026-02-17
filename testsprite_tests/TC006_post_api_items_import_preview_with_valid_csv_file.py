import requests
from requests.auth import HTTPBasicAuth
import io

BASE_URL = "http://localhost:3002"


def test_post_api_items_import_preview_with_valid_csv_file():
    # Admin credentials
    username = "jose"
    password = "Password1"
    timeout = 30

    # Login to get JWT token
    try:
        login_resp = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": username, "password": password},
            timeout=timeout,
        )
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        token = login_resp.json().get("token")
        assert token, "Token not found in login response"
    except requests.RequestException as e:
        assert False, f"Exception during login: {e}"

    headers = {
        "Authorization": f"Bearer {token}",
    }

    # Prepare a valid CSV file content for items import preview
    csv_content = (
        "itemCode,description,category,unitOfMeasure,minQuantity,maxQuantity,standardCost,defaultVendorId,notes\n"
        "TEST-ITEM-001,Test Item Description,Category1,EA,1,100,9.99,1,Test notes\n"
        "TEST-ITEM-002,Another Item,Category2,EA,5,50,19.95,1,\n"
    )
    file_obj = io.BytesIO(csv_content.encode("utf-8"))
    files = {
        "file": ("items.csv", file_obj, "text/csv"),
    }

    try:
        resp = requests.post(
            f"{BASE_URL}/api/items/import/preview",
            headers=headers,
            files=files,
            timeout=timeout,
        )
    except requests.RequestException as e:
        assert False, f"Exception during POST /api/items/import/preview: {e}"

    assert resp.status_code == 200, f"Unexpected status code: {resp.status_code}, body: {resp.text}"
    json_data = resp.json()

    # Validate response keys
    assert "rows" in json_data, "'rows' key missing from response"
    assert isinstance(json_data["rows"], list), "'rows' is not a list"

    assert "errors" in json_data, "'errors' key missing from response"
    assert isinstance(json_data["errors"], list), "'errors' is not a list"

    # Rows should be normalized row objects (dict)
    for row in json_data["rows"]:
        assert isinstance(row, dict), f"Row is not a dict: {row}"

    # Errors, if present, should have keys: rowNumber, field, message
    for err in json_data["errors"]:
        assert isinstance(err, dict), f"Error entry not dict: {err}"
        for key in ["rowNumber", "field", "message"]:
            assert key in err, f"Error entry missing key '{key}': {err}"


test_post_api_items_import_preview_with_valid_csv_file()