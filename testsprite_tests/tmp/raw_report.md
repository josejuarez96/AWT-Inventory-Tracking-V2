
# TestSprite AI Testing Report(MCP)

---

## 1️⃣ Document Metadata
- **Project Name:** AWT Inventory Tracking V2
- **Date:** 2026-02-17
- **Prepared by:** TestSprite AI Team

---

## 2️⃣ Requirement Validation Summary

#### Test TC001 get api health returns server status and timestamp
- **Test Code:** [TC001_get_api_health_returns_server_status_and_timestamp.py](./TC001_get_api_health_returns_server_status_and_timestamp.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/2037d783-63f8-47e7-802c-73c9bb39c23d/636270de-fe65-46e0-809a-a04975b804c4
- **Status:** ✅ Passed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC002 post api auth login with valid credentials returns token and user
- **Test Code:** [TC002_post_api_auth_login_with_valid_credentials_returns_token_and_user.py](./TC002_post_api_auth_login_with_valid_credentials_returns_token_and_user.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/2037d783-63f8-47e7-802c-73c9bb39c23d/c3fa6b6b-bb35-4a7d-b486-db9da58a4b1d
- **Status:** ✅ Passed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC003 post api auth login rate limits excessive attempts
- **Test Code:** [TC003_post_api_auth_login_rate_limits_excessive_attempts.py](./TC003_post_api_auth_login_rate_limits_excessive_attempts.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 56, in <module>
  File "<string>", line 44, in test_post_api_auth_login_rate_limits_excessive_attempts
AssertionError: Expected at least one 429 Too Many Requests response after 10 attempts, but none found

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/2037d783-63f8-47e7-802c-73c9bb39c23d/598443df-a1b1-4f33-9530-d7c4b26ad46c
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC004 post api auth change password with valid current and strong new password
- **Test Code:** [TC004_post_api_auth_change_password_with_valid_current_and_strong_new_password.py](./TC004_post_api_auth_change_password_with_valid_current_and_strong_new_password.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/2037d783-63f8-47e7-802c-73c9bb39c23d/0f36537c-bc30-429d-adf7-bae9d291bb40
- **Status:** ✅ Passed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC005 post api users create new user with valid data as admin
- **Test Code:** [TC005_post_api_users_create_new_user_with_valid_data_as_admin.py](./TC005_post_api_users_create_new_user_with_valid_data_as_admin.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/2037d783-63f8-47e7-802c-73c9bb39c23d/7795997b-4080-42cb-81c0-37085de6a045
- **Status:** ✅ Passed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC006 post api items import preview with valid csv file
- **Test Code:** [TC006_post_api_items_import_preview_with_valid_csv_file.py](./TC006_post_api_items_import_preview_with_valid_csv_file.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/2037d783-63f8-47e7-802c-73c9bb39c23d/3b54a564-dc1e-44cb-ad3a-30c2f8fcd0e7
- **Status:** ✅ Passed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC007 post api transactions receipts create single receipt transaction
- **Test Code:** [TC007_post_api_transactions_receipts_create_single_receipt_transaction.py](./TC007_post_api_transactions_receipts_create_single_receipt_transaction.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/2037d783-63f8-47e7-802c-73c9bb39c23d/6c9843b6-37bb-4fb4-9ce5-7f3e37a6b348
- **Status:** ✅ Passed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC008 post api transactions transfers create atomic transfer pair
- **Test Code:** [TC008_post_api_transactions_transfers_create_atomic_transfer_pair.py](./TC008_post_api_transactions_transfers_create_atomic_transfer_pair.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 108, in <module>
  File "<string>", line 94, in test_post_api_transactions_transfers_create_atomic_transfer_pair
AssertionError: Outbound transaction type mismatch: expected 'TRANSFER' got 'None'

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/2037d783-63f8-47e7-802c-73c9bb39c23d/9eb3e61b-a67f-48f9-b127-ad8ef8678eb5
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC009 get api transactions stock position returns paginated inventory
- **Test Code:** [TC009_get_api_transactions_stock_position_returns_paginated_inventory.py](./TC009_get_api_transactions_stock_position_returns_paginated_inventory.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/2037d783-63f8-47e7-802c-73c9bb39c23d/54bf4114-07cd-4966-8da7-2f64b8eaae7c
- **Status:** ✅ Passed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC010 post api production kit executes kitting order with stock validation
- **Test Code:** [TC010_post_api_production_kit_executes_kitting_order_with_stock_validation.py](./TC010_post_api_production_kit_executes_kitting_order_with_stock_validation.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 173, in <module>
  File "<string>", line 170, in test_post_api_production_kit_executes_kitting_order_with_stock_validation
AssertionError: No CONSUMPTION transaction found in order

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/2037d783-63f8-47e7-802c-73c9bb39c23d/080c10c6-18ad-473d-ae01-40b5c657381b
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---


## 3️⃣ Coverage & Matching Metrics

- **70.00** of tests passed

| Requirement        | Total Tests | ✅ Passed | ❌ Failed  |
|--------------------|-------------|-----------|------------|
| ...                | ...         | ...       | ...        |
---


## 4️⃣ Key Gaps / Risks
{AI_GNERATED_KET_GAPS_AND_RISKS}
---