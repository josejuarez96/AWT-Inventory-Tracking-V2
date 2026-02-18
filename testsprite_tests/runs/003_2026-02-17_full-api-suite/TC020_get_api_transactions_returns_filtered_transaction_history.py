import requests

BASE_URL = "http://localhost:3000"
LOGIN_PATH = "/api/auth/login"
TRANSACTIONS_PATH = "/api/transactions"
TIMEOUT = 30


def test_get_api_transactions_returns_filtered_transaction_history():
    # Step 1: Authenticate and get JWT token
    login_url = BASE_URL + LOGIN_PATH
    login_payload = {"username": "jose", "password": "password123"}
    try:
        login_resp = requests.post(login_url, json=login_payload, timeout=TIMEOUT)
        assert login_resp.status_code == 200, f"Login failed with status {login_resp.status_code}"
        login_data = login_resp.json()
        token = login_data.get("token")
        assert token is not None and isinstance(token, str) and token != "", "No JWT token received"
    except requests.RequestException as e:
        assert False, f"Login request failed: {e}"

    headers = {"Authorization": f"Bearer {token}"}

    # Step 2: GET /api/transactions (no filter) - expect 200 and transactions array
    transactions_url = BASE_URL + TRANSACTIONS_PATH
    try:
        resp_all = requests.get(transactions_url, headers=headers, timeout=TIMEOUT)
        assert resp_all.status_code == 200, f"GET /api/transactions failed with status {resp_all.status_code}"
        data_all = resp_all.json()
        assert "transactions" in data_all, "'transactions' key not in response"
        assert isinstance(data_all["transactions"], list), "'transactions' is not a list"
    except requests.RequestException as e:
        assert False, f"GET /api/transactions request failed: {e}"

    # Step 3: GET /api/transactions?type=RECEIPT - expect 200, transactions array with transactionType RECEIPT only
    params = {"type": "RECEIPT"}
    try:
        resp_filtered = requests.get(transactions_url, headers=headers, params=params, timeout=TIMEOUT)
        assert resp_filtered.status_code == 200, f"GET /api/transactions with filter failed with status {resp_filtered.status_code}"
        data_filt = resp_filtered.json()
        assert "transactions" in data_filt, "'transactions' key not in filtered response"
        transactions = data_filt["transactions"]
        assert isinstance(transactions, list), "'transactions' in filtered response is not a list"
        for txn in transactions:
            txn_type = txn.get("transactionType") or txn.get("transaction_type")  # tolerate underscore or camelCase
            assert txn_type == "RECEIPT", f"TransactionType expected 'RECEIPT', got '{txn_type}' in transaction ID {txn.get('id')}"
    except requests.RequestException as e:
        assert False, f"GET /api/transactions with filter request failed: {e}"


test_get_api_transactions_returns_filtered_transaction_history()