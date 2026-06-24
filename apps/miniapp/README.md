# Miniapp

Created by Q-TD-FINAL-005 A+B+C landing. This is a real repository scaffold file, not production execution evidence.

## Q40 Withdraw Records API Contract

Status: local engineering contract only. No real WeChat Mini Program package is built in Q40.

- `POST /api/miniapp/withdraw-applies`: creates a signed-anchor withdraw application and freezes the withdrawable balance.
- `GET /api/miniapp/withdraw-applies?anchorId=ANCHOR-001`: returns the miniapp withdraw record list with `statusText`, `progressStep`, `frozenAmountCents`, and `detailPath`.
- `GET /api/miniapp/withdraw-applies/:applyId`: returns the miniapp withdraw detail with `statusHistory`, `paymentInfoSnapshot`, and current balance transaction snapshot.
- Q40 verifies that admin first review, finance review, and pay-result import are reflected back into the miniapp list/detail responses.
