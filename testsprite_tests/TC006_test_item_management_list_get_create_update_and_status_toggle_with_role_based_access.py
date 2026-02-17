import requests
import uuid

BASE_URL = "http://localhost:3000"
TIMEOUT = 30


def test_item_management_list_get_create_update_and_status_toggle_with_role_based_access():
    login_url = f"{BASE_URL}/api/auth/login"
    items_url = f"{BASE_URL}/api/items"

    # Step 1: Authenticate as admin user (jose)
    login_payload = {"username": "jose", "password": "password123"}
    login_resp = requests.post(login_url, json=login_payload, timeout=TIMEOUT)
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    token = login_resp.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Step 2: List items as authenticated admin user (GET /api/items)
    list_resp = requests.get(items_url, headers=headers, timeout=TIMEOUT)
    assert list_resp.status_code == 200, f"List items failed: {list_resp.text}"
    items = list_resp.json().get("items")
    assert isinstance(items, list), "Items is not a list"

    # If no items, create one to have a valid ID for later GET / PUT / PATCH
    created_item = None
    try:
        if not items:
            # Create a new item as admin user (POST /api/items)
            unique_code = f"CODE-{uuid.uuid4().hex[:8]}"
            create_payload = {
                "itemCode": unique_code,
                "description": "Test Item Description",
                "category": "Test Category",
                "unitOfMeasure": "EA",
                "minQuantity": 5,
                "maxQuantity": 100,
                "notes": "Test notes"
            }
            create_resp = requests.post(items_url, headers=headers, json=create_payload, timeout=TIMEOUT)
            assert create_resp.status_code == 201, f"Create item failed: {create_resp.text}"
            created_item = create_resp.json().get("item")
            assert created_item is not None and "id" in created_item, "Created item missing id"
            item_id = created_item["id"]
        else:
            # Use the first item for tests requiring an item id
            item_id = items[0]["id"]

        # Step 3: Get single item by valid ID (GET /api/items/:id)
        get_url = f"{items_url}/{item_id}"
        get_resp = requests.get(get_url, headers=headers, timeout=TIMEOUT)
        assert get_resp.status_code == 200, f"Get single item failed: {get_resp.text}"
        item_detail = get_resp.json().get("item")
        assert item_detail is not None and item_detail["id"] == item_id, "Item detail id mismatch"

        # Step 4: Get single item by invalid ID format (GET /api/items/invalid-id)
        invalid_id_url = f"{items_url}/invalid-id"
        invalid_id_resp = requests.get(invalid_id_url, headers=headers, timeout=TIMEOUT)
        assert invalid_id_resp.status_code == 400, "Expected 400 for invalid id format"

        # Step 5: Create new item as admin user (POST /api/items) - check duplicate itemCode conflict
        new_item_code = f"CODE-{uuid.uuid4().hex[:8]}"
        create_payload = {
            "itemCode": new_item_code,
            "description": "New Test Item",
            "category": "New Category",
            "unitOfMeasure": "EA",
            "minQuantity": 1,
            "maxQuantity": 50,
            "notes": "Notes for new item"
        }
        create_resp = requests.post(items_url, headers=headers, json=create_payload, timeout=TIMEOUT)
        assert create_resp.status_code == 201, f"Create new item failed: {create_resp.text}"
        new_item = create_resp.json().get("item")
        assert new_item is not None and new_item["itemCode"] == new_item_code, "Created item mismatch"
        new_item_id = new_item["id"]

        # Step 6: Try creating item with duplicate itemCode (POST /api/items)
        dup_payload = {
            "itemCode": new_item_code,
            "description": "Duplicate Code Item"
        }
        dup_resp = requests.post(items_url, headers=headers, json=dup_payload, timeout=TIMEOUT)
        assert dup_resp.status_code == 409, "Expected 409 conflict for duplicate itemCode"

        # Step 7: Update existing item (PUT /api/items/:id)
        update_url = f"{items_url}/{new_item_id}"
        update_payload = {
            "description": "Updated Description",
            "category": "Updated Category",
            "unitOfMeasure": "BOX",
            "minQuantity": 3,
            "maxQuantity": 60,
            "notes": "Updated notes"
        }
        update_resp = requests.put(update_url, headers=headers, json=update_payload, timeout=TIMEOUT)
        assert update_resp.status_code == 200, f"Update item failed: {update_resp.text}"
        updated_item = update_resp.json().get("item")
        assert updated_item is not None, "Updated item missing"
        assert updated_item["description"] == "Updated Description", "Item description not updated"

        # Step 8: Update with non-existent id (PUT) - expect 404
        fake_id = 1234567890
        fake_update_url = f"{items_url}/{fake_id}"
        fake_update_payload = {"description": "Should not update"}
        fake_update_resp = requests.put(fake_update_url, headers=headers, json=fake_update_payload, timeout=TIMEOUT)
        assert fake_update_resp.status_code == 404, "Expected 404 for update with non-existent id"

        # Step 9: Attempt to update itemCode to an existing code - expect 409
        # For this, create a second item
        second_code = f"CODE-{uuid.uuid4().hex[:8]}"
        second_create_payload = {
            "itemCode": second_code,
            "description": "Second Item"
        }
        second_create_resp = requests.post(items_url, headers=headers, json=second_create_payload, timeout=TIMEOUT)
        assert second_create_resp.status_code == 201, f"Second item creation failed: {second_create_resp.text}"
        second_item = second_create_resp.json().get("item")
        assert second_item is not None and "id" in second_item, "Second created item invalid"
        second_item_id = second_item["id"]

        # Attempt to update second itemCode to new_item_code (which already exists)
        conflict_update_payload = {"itemCode": new_item_code}
        conflict_update_url = f"{items_url}/{second_item_id}"
        conflict_update_resp = requests.put(conflict_update_url, headers=headers, json=conflict_update_payload, timeout=TIMEOUT)
        assert conflict_update_resp.status_code == 409, "Expected 409 conflict when updating to duplicate itemCode"

        # Step 10: Toggle item active status (PATCH /api/items/:id/status)
        patch_url = f"{items_url}/{new_item_id}/status"
        patch_payload = {"isActive": False}
        patch_resp = requests.patch(patch_url, headers=headers, json=patch_payload, timeout=TIMEOUT)
        assert patch_resp.status_code == 200, f"Patch active status failed: {patch_resp.text}"
        patched_item = patch_resp.json().get("item")
        assert patched_item is not None and patched_item.get("id") == new_item_id, "Patched item missing or wrong id"
        assert patched_item.get("isActive") is False, "Item isActive not set to False"

        # Reactivate the item for cleanup/better test state
        reactivate_payload = {"isActive": True}
        reactivate_resp = requests.patch(patch_url, headers=headers, json=reactivate_payload, timeout=TIMEOUT)
        assert reactivate_resp.status_code == 200, f"Reactivation patch failed: {reactivate_resp.text}"
    finally:
        # Cleanup: Try to deactivate created items to simulate soft-delete (since no delete endpoint)
        if created_item and "id" in created_item:
            deactivate_url = f"{items_url}/{created_item['id']}/status"
            requests.patch(deactivate_url, headers=headers, json={"isActive": False}, timeout=TIMEOUT)
        if 'new_item_id' in locals():
            deactivate_url = f"{items_url}/{new_item_id}/status"
            requests.patch(deactivate_url, headers=headers, json={"isActive": False}, timeout=TIMEOUT)
        if 'second_item_id' in locals():
            deactivate_url = f"{items_url}/{second_item_id}/status"
            requests.patch(deactivate_url, headers=headers, json={"isActive": False}, timeout=TIMEOUT)


test_item_management_list_get_create_update_and_status_toggle_with_role_based_access()
