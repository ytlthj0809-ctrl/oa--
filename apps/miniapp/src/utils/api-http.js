const friendlyErrorMessages = {
  AUTH_REQUIRED: "登录已过期，请重新登录",
  BALANCE_INSUFFICIENT: "当前可提现余额不足，请确认余额后再提交",
  DUPLICATE_PAYMENT_RISK_BLOCKED: "系统检测到重复打款风险，已阻断本次操作，请联系财务核对",
  INSUFFICIENT_BALANCE: "当前可提现余额不足，请确认余额后再提交",
  MINIAPP_WITHDRAW_MIN_AMOUNT: "提现金额低于当前最低限额，请刷新规则后重试",
  MINIAPP_WITHDRAW_WINDOW_CLOSED: "当前不在提现开放时段，请刷新页面查看下次开放时间",
  PAYMENT_INFO_INCOMPLETE: "打款信息未生效，请先补全并等待审核通过",
  PAYMENT_INFO_NOT_FOUND: "请先填写打款信息，审核通过后再继续",
  PAYMENT_INFO_REQUIRED: "请先填写打款信息，审核通过后再继续",
  WITHDRAW_APPLY_ALREADY_BATCHED: "这笔提现已进入付款批次，请勿重复操作",
  WITHDRAW_APPLY_NOT_FOUND: "没有找到这笔提现记录，请刷新后重试",
  WITHDRAW_APPLY_STATUS_UNSUPPORTED: "当前提现状态暂不能执行这个操作，请刷新记录后确认",
  WITHDRAW_APPLY_TRANSITION_BLOCKED: "当前提现状态不允许执行这个操作，请刷新记录后确认",
  WITHDRAW_FREEZE_FAILED: "余额冻结失败，提现未提交，请稍后重试",
  WITHDRAW_REJECT_REASON_REQUIRED: "驳回必须填写原因，方便主播查看处理结果",
  WITHDRAW_REVIEW_ROLE_REQUIRED: "当前账号没有权限执行该审核动作，请联系管理员",
  YZH_SIGN_REQUIRED: "请先完成云账户签约，再提交提现",
};

function createAuthRequiredError(message = "请先登录") {
  const error = new Error(message);
  error.code = "AUTH_REQUIRED";
  error.silent = true;
  return error;
}

function createRequestError(payload, route, responseStatusCode) {
  const sourceError = payload && payload.error ? payload.error : {};
  const code = sourceError.code || payload.code || "";
  const userMessage = sourceError.userMessage || friendlyErrorMessages[code];
  const technicalMessage = sourceError.message || payload.message;
  const message = userMessage || technicalMessage || "请求失败，请稍后重试";
  const error = new Error(message);
  error.code = code || `HTTP_${responseStatusCode || "ERROR"}`;
  error.route = route;
  error.statusCode = responseStatusCode;
  error.technicalMessage = technicalMessage || "";
  return error;
}

function isAuthRequiredError(error) {
  return Boolean(error && error.code === "AUTH_REQUIRED");
}

function createRequester({ getServiceOrigin, getSession, onUnauthorized }) {
  return function request(route, options = {}) {
    const maxRetries = options.method && options.method !== "GET" ? 0 : (options.retries || 1);
    let attempt = 0;

    function doRequest() {
      return new Promise((resolve, reject) => {
        const session = getSession();
        const includeAuth = options.auth !== false;
        wx.request({
          url: `${getServiceOrigin()}${route}`,
          method: options.method || "GET",
          data: options.data || {},
          header: {
            "content-type": "application/json",
            ...(includeAuth && session && session.token ? { "x-miniapp-token": session.token } : {}),
          },
          success(response) {
            const payload = response.data || {};
            if (response.statusCode === 401) {
              if (options.skipAuthRedirect) {
                reject(new Error("当前暂时无法获取公开信息，请稍后再试"));
                return;
              }
              reject(onUnauthorized());
              return;
            }
            if (response.statusCode >= 400 || payload.ok === false) {
              reject(createRequestError(payload, route, response.statusCode));
              return;
            }
            resolve(payload.data);
          },
          fail(error) {
            const message = error && error.errMsg && error.errMsg.includes("timeout")
              ? "网络请求超时，请稍后重试"
              : "网络连接失败，请检查网络后重试";
            reject(new Error(message));
          },
        });
      });
    }

    return doRequest().catch((error) => {
      if (attempt < maxRetries && !error.code) {
        attempt += 1;
        return new Promise((resolve) => setTimeout(resolve, 500 * attempt)).then(doRequest);
      }
      throw error;
    });
  };
}

module.exports = {
  createAuthRequiredError,
  createRequester,
  isAuthRequiredError,
};
