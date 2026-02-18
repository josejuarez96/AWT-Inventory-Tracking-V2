import requests
import time

BASE_URL = "http://localhost:3002"
LOGIN_ENDPOINT = "/api/auth/login"
BOMS_ENDPOINT = "/api/boms"
TIMEOUT = 30

def test_standard_user_can_read_single_bom_by_id():
    # Step 1: Login as standard user
    login_payload = {"username": "alix", "password": "Password1"}
    login_resp = requests.post(f"{BASE_URL}{LOGIN_ENDPOINT}", json=login_payload, timeout=TIMEOUT)
    assert login_resp.status_code == 200, f"Login failed with status {login_resp.status_code}: {login_resp.text}"
    token = login_resp.json().get("token")
    assert token, "Token not found in login response"
    headers = {"Authorization": f"Bearer {token}"}

    time.sleep(2)

    # Step 2: GET /api/boms to get list of BOMs
    list_resp = requests.get(f"{BASE_URL}{BOMS_ENDPOINT}", headers=headers, timeout=TIMEOUT)
    assert list_resp.status_code == 200, f"Failed to get BOMs list: {list_resp.status_code} {list_resp.text}"
    boms_data = list_resp.json()
    boms_list = boms_data.get("boms") or boms_data.get("boms")  # Accept either key if schema changed
    assert isinstance(boms_list, list), f"BOMs list expected but got: {boms_list}"

    assert len(boms_list) > 0, "No BOMs found for standard user"

    first_bom = boms_list[0]
    bom_id = first_bom.get("id") or first_bom.get("bomId") or first_bom.get("bom_id")
    # Accept common variations; mandatory to have 'id' to build URL
    assert bom_id is not None, "BOM object does not contain an ID"

    time.sleep(2)

    # Step 3: GET /api/boms/:id to retrieve the single BOM detail
    detail_resp = requests.get(f"{BASE_URL}{BOMS_ENDPOINT}/{bom_id}", headers=headers, timeout=TIMEOUT)
    assert detail_resp.status_code == 200, f"Failed to get BOM detail: {detail_resp.status_code} {detail_resp.text}"
    bom_detail = detail_resp.json().get("bom")
    assert isinstance(bom_detail, dict), f"BOM detail expected to be dict but got: {bom_detail}"
    # Check components array presence - components might be under 'lines', 'components' or similar per schema
    components = bom_detail.get("lines") or bom_detail.get("components") or bom_detail.get("componentsList")
    assert isinstance(components, list), "Components array missing in BOM detail or is not a list"

test_standard_user_can_read_single_bom_by_id()