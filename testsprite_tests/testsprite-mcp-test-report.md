
# TestSprite AI Testing Report (MCP) — Phase 1

---

## 1. Document Metadata
- **Project Name:** AWT Inventory Tracking V2
- **Phase:** Phase 1 — Authentication & User Management API
- **Date:** 2026-02-16
- **Prepared by:** TestSprite AI Team + Claude Code
- **Run ID:** da24e184-009c-400e-b237-c79c335f6ff1

---

## 2. Requirement Validation Summary

### Requirement Group 1 — Health Check

#### TC001 — Health Check: API returns server status and timestamp
- **Test Code:** [TC001_health_check_api_returns_server_status_and_timestamp.py](./TC001_health_check_api_returns_server_status_and_timestamp.py)
- **Test Visualization:** https://www.testsprite.com/dashboard/mcp/tests/da24e184-009c-400e-b237-c79c335f6ff1/d1cef1ae-9dc2-4682-bc99-0fe5c3bbaa3c
- **Status:** ✅ Passed
- **Analysis:** `GET /api/health` returns HTTP 200 with a JSON body containing `status`, `message`, and `timestamp` fields. The message contains the word "running" and the timestamp is a valid ISO 8601 string. Endpoint is publicly accessible without authentication.

---

### Requirement Group 2 — Authentication

#### TC002 — Login returns token and user on valid credentials
- **Test Code:** [TC002_authentication_login_returns_token_and_user_on_valid_credentials.py](./TC002_authentication_login_returns_token_and_user_on_valid_credentials.py)
- **Test Visualization:** https://www.testsprite.com/dashboard/mcp/tests/da24e184-009c-400e-b237-c79c335f6ff1/db15ae06-2a3b-4d52-9c84-b8106ad31b19
- **Status:** ✅ Passed
- **Analysis:** `POST /api/auth/login` correctly validates credentials via bcrypt, signs a 7-day JWT, updates `lastLoginAt`, and returns `{ token, user }`. Invalid credentials return 401. The `passwordHash` field is excluded from the response. Both seed accounts (`jose`/admin and `alix`/user) authenticate successfully.

#### TC003 — `/me` returns authenticated user for valid token
- **Test Code:** [TC003_authentication_me_returns_user_for_valid_token.py](./TC003_authentication_me_returns_user_for_valid_token.py)
- **Test Visualization:** https://www.testsprite.com/dashboard/mcp/tests/da24e184-009c-400e-b237-c79c335f6ff1/b011a72e-5716-4159-ae07-1bc2994a866b
- **Status:** ✅ Passed
- **Analysis:** `GET /api/auth/me` verifies the Bearer token, reloads the user from the database on each request (validating `isActive`), and returns the current user without the password hash. Missing or invalid tokens return 401.

#### TC004 — Logout acknowledges with confirmation message
- **Test Code:** [TC004_authentication_logout_acknowledges_logout_with_message.py](./TC004_authentication_logout_acknowledges_logout_with_message.py)
- **Test Visualization:** https://www.testsprite.com/dashboard/mcp/tests/da24e184-009c-400e-b237-c79c335f6ff1/62c22738-cbba-4d07-bddd-8fdaf467c774
- **Status:** ✅ Passed
- **Analysis:** `POST /api/auth/logout` returns HTTP 200 with a confirmation message. The server is stateless (JWT-based) so the client is responsible for clearing the `awt_token` from localStorage. Endpoint correctly requires a valid Bearer token and returns 401 without one.

---

### Requirement Group 3 — User Management

#### TC005 — List users requires admin authorization
- **Test Code:** [TC005_user_management_list_users_requires_admin_authorization.py](./TC005_user_management_list_users_requires_admin_authorization.py)
- **Test Visualization:** https://www.testsprite.com/dashboard/mcp/tests/da24e184-009c-400e-b237-c79c335f6ff1/dda26345-2367-4bdb-9a88-a1c8832c7516
- **Status:** ✅ Passed
- **Analysis:** `GET /api/users` enforces role-based access control. Admin users receive HTTP 200 with `{ users: [...] }` where each record includes `id`, `username`, `fullName`, `role`, `isActive`, `lastLoginAt` and explicitly excludes `passwordHash`. Unauthenticated requests return 401; non-admin authenticated requests return 403.

#### TC006 — Create user with admin authorization
- **Test Code:** [TC006_user_management_create_user_with_admin_authorization.py](./TC006_user_management_create_user_with_admin_authorization.py)
- **Test Visualization:** https://www.testsprite.com/dashboard/mcp/tests/da24e184-009c-400e-b237-c79c335f6ff1/0ac7b7ea-5073-41a0-a9fb-05fce4670d4b
- **Status:** ✅ Passed
- **Analysis:** `POST /api/users` creates a new user when called with an admin token, returning HTTP 201 with `{ user: {...} }`. Duplicate usernames return 409 Conflict. Non-admin tokens receive 403 Forbidden. Passwords are hashed via bcrypt and never returned in any response.

#### TC007 — Update user fields with admin authorization
- **Test Code:** [TC007_user_management_update_user_fields_with_admin_authorization.py](./TC007_user_management_update_user_fields_with_admin_authorization.py)
- **Test Visualization:** https://www.testsprite.com/dashboard/mcp/tests/da24e184-009c-400e-b237-c79c335f6ff1/32adabbb-95e7-4a4f-bd8b-709fbbd4fed4
- **Status:** ✅ Passed
- **Analysis:** `PUT /api/users/:id` correctly updates `fullName`, `role`, and `password` (all fields optional). Returns HTTP 200 with `{ user: {...} }` — `passwordHash` is never returned. Sending an empty body returns 400. A non-existent user ID returns 404 (Prisma P2025 error mapped correctly). Test uses a unique random-suffix username and cleans up via `DELETE` after itself.

#### TC008 — Activate/Deactivate user account with admin authorization
- **Test Code:** [TC008_user_management_activate_deactivate_user_account_with_admin_authorization.py](./TC008_user_management_activate_deactivate_user_account_with_admin_authorization.py)
- **Test Visualization:** https://www.testsprite.com/dashboard/mcp/tests/da24e184-009c-400e-b237-c79c335f6ff1/1b0a1d49-cb56-4202-805c-18135e914f5d
- **Status:** ✅ Passed
- **Analysis:** `PATCH /api/users/:id/status` correctly toggles `isActive` and returns HTTP 200 with `{ user: {...} }`. Deactivation and re-activation both reflect the updated `isActive` boolean. Attempting to deactivate the authenticated admin's own account correctly returns HTTP 400 with `{"error": "Cannot deactivate your own account"}`. Test uses a unique random-suffix username each run to ensure idempotency.

---

## 3. Coverage & Matching Metrics

- **Pass rate: 100% (8 of 8 tests)**

| Requirement Area          | Total Tests | ✅ Passed | ❌ Failed |
|---------------------------|-------------|-----------|----------|
| Health Check              | 1           | 1         | 0        |
| Authentication (login, me, logout) | 3  | 3         | 0        |
| User Management — List    | 1           | 1         | 0        |
| User Management — Create  | 1           | 1         | 0        |
| User Management — Update  | 1           | 1         | 0        |
| User Management — Status toggle | 1     | 1         | 0        |
| **Total**                 | **8**       | **8**     | **0**    |

---

## 4. Key Gaps / Risks

### Gap 1 — No user delete endpoint (medium priority)
There is no `DELETE /api/users/:id` endpoint. The only way to remove a user is to deactivate them (`isActive: false`). This causes accumulation of test/seed users in the database over time, and test cleanup must fall back to status-toggling. **Recommendation:** Add `DELETE /api/users/:id` (soft-delete with anonymized PII, or hard-delete with cascade) in Phase 2.

### Gap 2 — No token revocation / blacklist (low priority for Phase 1)
The logout endpoint returns 200 but the JWT remains cryptographically valid until its 7-day expiry. The `authenticate` middleware mitigates this by fetching the user from the DB on every request and checking `isActive` — so deactivated accounts are immediately blocked. However, there is no token blacklist for active users who log out. **Recommendation:** Acceptable for Phase 1. Revisit when adding refresh tokens or stricter session control.

### Gap 3 — Standard user self-service profile update (out of scope Phase 1)
There is no endpoint for a non-admin user to update their own password or profile. Only admins can modify user records. **Recommendation:** Consider `PUT /api/auth/me` or `PATCH /api/auth/password` in a future phase.

### Gap 4 — API response envelope convention (documentation gap)
All single-user mutation endpoints (`POST /api/users`, `PUT /api/users/:id`, `PATCH /api/users/:id/status`) wrap the response in a `{ "user": {...} }` envelope, while `GET /api/users` returns `{ "users": [...] }`. This is intentional and consistent, but must be documented explicitly so future developers and AI-generated tests always unwrap correctly. **Recommendation:** Add a note to the API reference.

---

*Report generated: 2026-02-16 | Phase 1 complete — 8/8 tests passing | Next: Phase 2 — Inventory Management*
