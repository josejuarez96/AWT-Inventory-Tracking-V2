import requests
import time
import random
import string

BASE_URL = "http://localhost:3002/api"
TIMEOUT = 30

def random_suffix(length=6):
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=length))

def test_workflow_admin_setup_items_and_vendors():
    session = requests.Session()
    admin_credentials = {"username": "jose", "password": "Password1"}
    headers = {"Content-Type": "application/json"}

    try:
        # Step 1: POST /api/auth/login to get admin token
        login_resp = session.post(f"{BASE_URL}/auth/login", json=admin_credentials, timeout=TIMEOUT)
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        login_data = login_resp.json()
        assert "token" in login_data, "No token in login response"
        token = login_data["token"]
        auth_headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

        # Step: Create vendor first (needed for item defaultVendorId)
        suffix = random_suffix()
        new_vendor_payload = {
            "vendorCode": f"WF-VEND-001-{suffix}",
            "vendorName": "Workflow Vendor"
        }
        vendor_create_resp = session.post(f"{BASE_URL}/vendors", headers=auth_headers, json=new_vendor_payload, timeout=TIMEOUT)
        assert vendor_create_resp.status_code == 201, f"Vendor creation failed: {vendor_create_resp.text}"
        vendor_data = vendor_create_resp.json()
        assert "vendor" in vendor_data, "No vendor in vendor create response"
        created_vendor = vendor_data["vendor"]
        assert created_vendor["vendorCode"] == new_vendor_payload["vendorCode"]
        assert created_vendor["vendorName"] == new_vendor_payload["vendorName"]
        vendor_id = created_vendor["id"]

        time.sleep(2)

        # Step 2: POST /api/items to create a new item
        new_item_payload = {
            "itemCode": f"WF-ITEM-001-{suffix}",
            "description": "Workflow Test Item",
            "category": "Parts",
            "unitOfMeasure": "EA",
            "minQuantity": 1,
            "maxQuantity": 100,
            "standardCost": 10.0,
            "defaultVendorId": vendor_id,
            "notes": "Test item notes"
        }
        item_create_resp = session.post(f"{BASE_URL}/items", headers=auth_headers, json=new_item_payload, timeout=TIMEOUT)
        assert item_create_resp.status_code == 201, f"Item creation failed: {item_create_resp.text}"
        item_data = item_create_resp.json()
        assert "item" in item_data, "No item in item create response"
        created_item = item_data["item"]
        assert created_item["itemCode"] == new_item_payload["itemCode"]
        assert created_item["description"] == "Workflow Test Item"
        item_id = created_item["id"]

        time.sleep(2)

        # Step 3: GET /api/items to verify new item in active list
        items_resp = session.get(f"{BASE_URL}/items", headers=auth_headers, timeout=TIMEOUT)
        assert items_resp.status_code == 200, f"Fetching items failed: {items_resp.text}"
        items_data = items_resp.json()
        assert "items" in items_data, "No items key in items response"
        items_list = items_data["items"]
        found_item = any(item["id"] == item_id and item["itemCode"] == new_item_payload["itemCode"] for item in items_list)
        assert found_item, "Created item not found in item list"

        time.sleep(2)

        # Step 4: GET /api/vendors to verify new vendor appears
        vendors_resp = session.get(f"{BASE_URL}/vendors", headers=auth_headers, timeout=TIMEOUT)
        assert vendors_resp.status_code == 200, f"Fetching vendors failed: {vendors_resp.text}"
        vendors_data = vendors_resp.json()
        assert "vendors" in vendors_data, "No vendors key in vendors response"
        vendors_list = vendors_data["vendors"]
        found_vendor = any(vendor["id"] == vendor_id and vendor["vendorCode"] == new_vendor_payload["vendorCode"] for vendor in vendors_list)
        assert found_vendor, "Created vendor not found in vendor list"

        time.sleep(2)

        # Step 5: PUT /api/items/:id to update description
        updated_description = "Workflow Test Item - Updated"
        update_item_payload = {"description": updated_description}
        item_update_resp = session.put(f"{BASE_URL}/items/{item_id}", headers=auth_headers, json=update_item_payload, timeout=TIMEOUT)
        assert item_update_resp.status_code == 200, f"Item update failed: {item_update_resp.text}"
        updated_item_data = item_update_resp.json()
        assert "item" in updated_item_data, "No item in item update response"
        updated_item = updated_item_data["item"]
        assert updated_item["description"] == updated_description, "Item description was not updated"

        time.sleep(2)

        # Step 6: PUT /api/vendors/:id to update vendorName
        updated_vendor_name = "Workflow Vendor Updated"
        update_vendor_payload = {"vendorName": updated_vendor_name}
        vendor_update_resp = session.put(f"{BASE_URL}/vendors/{vendor_id}", headers=auth_headers, json=update_vendor_payload, timeout=TIMEOUT)
        assert vendor_update_resp.status_code == 200, f"Vendor update failed: {vendor_update_resp.text}"
        updated_vendor_data = vendor_update_resp.json()
        assert "vendor" in updated_vendor_data, "No vendor in vendor update response"
        updated_vendor = updated_vendor_data["vendor"]
        assert updated_vendor["vendorName"] == updated_vendor_name, "Vendor name was not updated"

    finally:
        # Cleanup: deactivate the created item and vendor to simulate deletion since no DELETE endpoints exist
        if 'token' in locals():
            if 'item_id' in locals():
                _ = session.patch(f"{BASE_URL}/items/{item_id}/status", headers=auth_headers, json={"isActive": False}, timeout=TIMEOUT)
                time.sleep(2)
            if 'vendor_id' in locals():
                _ = session.patch(f"{BASE_URL}/vendors/{vendor_id}/status", headers=auth_headers, json={"isActive": False}, timeout=TIMEOUT)

test_workflow_admin_setup_items_and_vendors()
