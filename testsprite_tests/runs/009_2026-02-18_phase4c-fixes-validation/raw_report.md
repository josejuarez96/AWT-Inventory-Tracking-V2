
# TestSprite AI Testing Report(MCP)

---

## 1️⃣ Document Metadata
- **Project Name:** AWT Inventory Tracking V2
- **Date:** 2026-02-18
- **Prepared by:** TestSprite AI Team

---

## 2️⃣ Requirement Validation Summary

#### Test TC001 receipt with future date is rejected for all users
- **Test Code:** [TC001_receipt_with_future_date_is_rejected_for_all_users.py](./TC001_receipt_with_future_date_is_rejected_for_all_users.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 137, in <module>
  File "<string>", line 77, in test_receipt_future_date_rejected_for_all_users
AssertionError: Expected 400 for admin, got 201

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/4695e3e8-4ca5-4b57-8275-717d48f7ef27/fa7d818c-8035-4491-82f7-8551bc6df168
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC002 receipt with date older than 30 days is rejected for all users
- **Test Code:** [TC002_receipt_with_date_older_than_30_days_is_rejected_for_all_users.py](./TC002_receipt_with_date_older_than_30_days_is_rejected_for_all_users.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/4695e3e8-4ca5-4b57-8275-717d48f7ef27/d22c627d-4ad7-4846-acf5-b769b6fbc0c2
- **Status:** ✅ Passed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC003 standard user blocked from posting receipt older than 7 days
- **Test Code:** [TC003_standard_user_blocked_from_posting_receipt_older_than_7_days.py](./TC003_standard_user_blocked_from_posting_receipt_older_than_7_days.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/4695e3e8-4ca5-4b57-8275-717d48f7ef27/f4763501-0665-4c15-83af-1a7e5a1576e2
- **Status:** ✅ Passed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC004 admin can post receipt between 8-30 days in the past
- **Test Code:** [TC004_admin_can_post_receipt_between_8_30_days_in_the_past.py](./TC004_admin_can_post_receipt_between_8_30_days_in_the_past.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/4695e3e8-4ca5-4b57-8275-717d48f7ef27/d2a19eb0-fa23-4526-b774-afa87de5e997
- **Status:** ✅ Passed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC005 standard user can post receipt within 7 days
- **Test Code:** [TC005_standard_user_can_post_receipt_within_7_days.py](./TC005_standard_user_can_post_receipt_within_7_days.py)
- **Test Error:** Traceback (most recent call last):
  File "<string>", line 74, in test_TC005_standard_user_can_post_receipt_within_7_days
AssertionError: Returned transaction itemId mismatch

During handling of the above exception, another exception occurred:

Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 86, in <module>
  File "<string>", line 84, in test_TC005_standard_user_can_post_receipt_within_7_days
AssertionError: Test TC005 failed: Returned transaction itemId mismatch

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/4695e3e8-4ca5-4b57-8275-717d48f7ef27/7778c8d7-aecb-4bbf-a305-75b53751c8fe
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC006 standard user can read BOMs list
- **Test Code:** [TC006_standard_user_can_read_BOMs_list.py](./TC006_standard_user_can_read_BOMs_list.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/4695e3e8-4ca5-4b57-8275-717d48f7ef27/9364380c-f1d8-473e-a4b3-df90c6c65a50
- **Status:** ✅ Passed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC007 standard user can read single BOM by id
- **Test Code:** [TC007_standard_user_can_read_single_BOM_by_id.py](./TC007_standard_user_can_read_single_BOM_by_id.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/4695e3e8-4ca5-4b57-8275-717d48f7ef27/ffd5657c-770b-4550-8a7e-6765bbefb41e
- **Status:** ✅ Passed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC008 standard user cannot create or modify BOMs
- **Test Code:** [TC008_standard_user_cannot_create_or_modify_BOMs.py](./TC008_standard_user_cannot_create_or_modify_BOMs.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/4695e3e8-4ca5-4b57-8275-717d48f7ef27/789191dd-29c5-400a-bcbb-b5e568325065
- **Status:** ✅ Passed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---


## 3️⃣ Coverage & Matching Metrics

- **75.00** of tests passed

| Requirement        | Total Tests | ✅ Passed | ❌ Failed  |
|--------------------|-------------|-----------|------------|
| ...                | ...         | ...       | ...        |
---


## 4️⃣ Key Gaps / Risks
{AI_GNERATED_KET_GAPS_AND_RISKS}
---