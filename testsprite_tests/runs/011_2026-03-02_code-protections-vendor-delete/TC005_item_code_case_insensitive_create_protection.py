import requests

BASE_URL = "http://localhost:3000"
TIMEOUT = 30

def test_item_code_case_insensitive_create_protection():
    # Authenticate as admin user 'jose' to get token for creating/deleting items
    admin_auth_resp = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": "jose", "password": "Password1"},
        timeout=TIMEOUT
    )
    assert admin_auth_resp.status_code == 200, f"Admin auth failed: {admin_auth_resp.text}"
    admin_token = admin_auth_resp.json().get("token")
    assert admin_token, "Admin token missing in auth response"
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Authenticate as standard user 'alix' to test unauthorized creation
    user_auth_resp = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": "alix", "password": "Password1"},
        timeout=TIMEOUT
    )
    assert user_auth_resp.status_code == 200, f"User auth failed: {user_auth_resp.text}"
    user_token = user_auth_resp.json().get("token")
    assert user_token, "User token missing in auth response"
    user_headers = {"Authorization": f"Bearer {user_token}"}
    
    created_item_id = None
    
    try:
        # 1) POST /api/items with {"itemCode":"test-case-item","description":"Test","unitOfMeasure":"EA"} 
        # 201, itemCode in response should be "TEST-CASE-ITEM"
        create_resp = requests.post(
            f"{BASE_URL}/api/items",
            headers=admin_headers,
            json={"itemCode": "test-case-item", "description": "Test", "unitOfMeasure": "EA"},
            timeout=TIMEOUT,
        )
        assert create_resp.status_code == 201, f"Unexpected status code for item creation: {create_resp.status_code}, body: {create_resp.text}"
        created_item = create_resp.json().get("item")
        assert created_item, "Response JSON missing 'item' key"
        created_item_id = created_item.get("id")
        assert created_item_id is not None, "Created item missing id"
        assert created_item.get("itemCode") == "TEST-CASE-ITEM", f"ItemCode not normalized to uppercase: {created_item.get('itemCode')}"
        # Other fields can be optionally asserted if desired:
        assert created_item.get("description") == "Test"
        assert created_item.get("unitOfMeasure") == "EA"
        
        # 2) POST /api/items with {"itemCode":"TEST-CASE-ITEM","description":"Dup","unitOfMeasure":"EA"} 
        # 409 conflict
        dup_upper_resp = requests.post(
            f"{BASE_URL}/api/items",
            headers=admin_headers,
            json={"itemCode": "TEST-CASE-ITEM", "description": "Dup", "unitOfMeasure": "EA"},
            timeout=TIMEOUT,
        )
        assert dup_upper_resp.status_code == 409, f"Expected 409 conflict on duplicate uppercase code, got {dup_upper_resp.status_code}"
        error_resp = dup_upper_resp.json()
        expected_error_msg = 'Item code "TEST-CASE-ITEM" already exists'
        assert error_resp.get("error") == expected_error_msg, f"Unexpected error message: {error_resp.get('error')}"
        
        # 3) POST /api/items with {"itemCode":"Test-Case-Item","description":"Dup2","unitOfMeasure":"EA"} 
        # 409 conflict
        dup_mixed_resp = requests.post(
            f"{BASE_URL}/api/items",
            headers=admin_headers,
            json={"itemCode": "Test-Case-Item", "description": "Dup2", "unitOfMeasure": "EA"},
            timeout=TIMEOUT,
        )
        assert dup_mixed_resp.status_code == 409, f"Expected 409 conflict on duplicate mixed case code, got {dup_mixed_resp.status_code}"
        error_resp = dup_mixed_resp.json()
        assert error_resp.get("error") == expected_error_msg, f"Unexpected error message: {error_resp.get('error')}"
        
        # 4) POST /api/items with no Authorization header 
        # 401 Unauthorized
        no_auth_resp = requests.post(
            f"{BASE_URL}/api/items",
            json={"itemCode": "another-item", "description": "No Auth", "unitOfMeasure": "EA"},
            timeout=TIMEOUT,
        )
        assert no_auth_resp.status_code == 401, f"Expected 401 Unauthorized without auth header, got {no_auth_resp.status_code}"
        no_auth_json = no_auth_resp.json()
        assert "error" in no_auth_json, "Expected error message in 401 response"
        # Optional: check error message text for "Unauthorized"
        assert "unauthorized" in no_auth_json.get("error", "").lower()
        
    finally:
        # Clean up: DELETE created item if exists (Admin token required)
        if created_item_id is not None:
            try:
                del_resp = requests.delete(
                    f"{BASE_URL}/api/items/{created_item_id}",
                    headers=admin_headers,
                    timeout=TIMEOUT,
                )
                # 200 OK or 204 No Content are common for successful DELETE
                assert del_resp.status_code in (200, 204), f"Unexpected delete status: {del_resp.status_code}, body: {del_resp.text}"
            except Exception as ex:
                print(f"Cleanup delete failed for item id {created_item_id}: {ex}")

test_item_code_case_insensitive_create_protection()
