# Miniapp

Created by Q-TD-FINAL-005 A+B+C landing. This is a real repository scaffold file, not production execution evidence.

## Q40 Withdraw Records API Contract

Status: local engineering contract only. No real WeChat Mini Program package is built in Q40.

- `POST /api/miniapp/withdraw-applies`: creates a signed-anchor withdraw application and freezes the withdrawable balance.
- `GET /api/miniapp/withdraw-applies?anchorId=ANCHOR-001`: returns the miniapp withdraw record list with `statusText`, `progressStep`, `frozenAmountCents`, and `detailPath`.
- `GET /api/miniapp/withdraw-applies/:applyId`: returns the miniapp withdraw detail with `statusHistory`, `paymentInfoSnapshot`, and current balance transaction snapshot.
- Q40 verifies that admin first review, finance review, and pay-result import are reflected back into the miniapp list/detail responses.

## Q41 Withdraw Page Skeleton

Status: miniapp withdraw source is wired through the production API service layer and the formal withdraw detail page.

- `app.json` registers `src/pages/withdraw/index` as the first miniapp page.
- `index.js` uses `src/services/miniapp-api.js` for submit and record list APIs.
- `index.wxml` renders withdraw records, status text, progress step, and opens `src/pages/withdraw-detail/index` for status history.
- `index.wxss` keeps the page dense and operational for repeated withdraw checks.

## Q42 Production Api And State Surface

Status: local miniapp source and API contract only. Q42 does not upload or publish a real WeChat Mini Program package.

- The miniapp API utility keeps a single production `environmentOptions` entry pointing to the formal service origin `https://api.jiayin.site`（正式域名）.
- The withdraw page separates `loadingList` and `submitting` so list refresh and submit do not overwrite each other; withdraw detail loading is handled by `src/pages/withdraw-detail/index`.
- Empty and error states are rendered in WXML with retry handling.
- The production app no longer exposes a visible environment switcher to anchors.

## Q43 Developer Tool Preflight

Status: local WeChat Developer Tool project configuration only. Q43 did not upload, preview, or publish a real Mini Program.

- `project.config.json` declares the project as a `miniprogram` with `miniprogramRoot` at the miniapp folder root.
- `app.js` and `app.wxss` are present at the miniapp root, so Developer Tools upload has the required global entry files.
- `app.json` points to `sitemap.json`; public login/register/help pages are allowed for search indexing, while authenticated business pages remain registered in `app.json` but are not exposed through sitemap search.
- Upload readiness checks must pass project structure first, then block real upload until appid and operator confirmation are available.

## Q44 Real AppID Preview Bridge

Status: real AppID is configured for local preview planning. No automatic preview, upload, or publish is performed by repository scripts.

- `project.config.json` now uses AppID `wx80cb7f54a22e6cfa`.
- Run `npm run miniapp:preview-plan` from the repository root to check project structure, AppID, local WeChat Developer Tools CLI discovery, and the preview command plan.
- If the WeChat Developer Tools CLI is not auto-detected, set `WECHAT_DEVTOOLS_CLI` to the local `cli` executable path and rerun the plan.
- Upload remains blocked unless an operator intentionally runs the upload mode and confirms the action. Do not commit upload private keys; `apps/miniapp/private.*.key`, `project.private.config.json`, and preview/upload output files are ignored.

## Q62 Anchor Registration Page

Status: local registration source and API contract only. Q62 does not perform real WeChat OAuth or upload.

- `app.json` keeps `src/pages/withdraw/index` first and adds `src/pages/register/index` for registration.
- `POST /api/miniapp/anchor-registration-requests` creates a local pending registration request.
- `GET /api/miniapp/anchor-registration-requests?mobile=...` lets the page refresh the latest request status.
- Admin approval remains required before the request creates an anchor profile, platform account, and balance account.
