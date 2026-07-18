# 嘉音提现 V2

只保留四个管理入口：今日处理、日数据导入、主播与余额、提现记录。后台仅支持超管账号；主播小程序沿用现有接口协议。

## 本地运行

1. 配置 `DATABASE_URL`。
2. 配置一次性 `ADMIN_BOOTSTRAP_USERNAME`、`ADMIN_BOOTSTRAP_PASSWORD`。
3. 执行 `npm run db:init`。
4. 执行 `npm start`，访问 `/admin/`。

密钥、账号密码、身份证号、银行卡号和真实日报不得提交到 Git。

## 正式环境

- Node.js 20+，MySQL 8；执行 `npm ci --omit=dev` 后再运行 `npm run db:init`。
- 首次初始化优先使用 `ADMIN_BOOTSTRAP_PASSWORD_HASH`；若临时使用 `ADMIN_BOOTSTRAP_PASSWORD`，成功后必须立即从环境移除。
- 日报原件写入私有腾讯 COS；正式环境缺少 COS 配置时会拒绝导入，不会降级到本地磁盘。
- 云账户签约只接受验签、解密成功的正式回调；私钥和 3DES 密钥只从服务器私有文件读取。
- Nginx 需将 `/api/` 反向代理到服务端，并从 `apps/admin` 提供 `/admin/` 静态文件。
- PM2 正式入口使用 `ops/start-api-with-env.sh`，它只读取权限为 `0640 root:deploy` 的私有运行配置，并阻止 DBA 凭据进入应用进程。
