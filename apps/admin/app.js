const state = {
  token: sessionStorage.getItem("adminToken") || "",
  account: null,
  page: "today",
  importFile: null,
  importPreview: null,
  anchorPage: 1,
  anchorQuery: "",
  withdrawDate: new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Shanghai",
  }),
};
const $ = (selector, root = document) => root.querySelector(selector);
const content = $("#content"),
  modal = $("#modal"),
  modalContent = $("#modal-content");
const pageMeta = {
  today: ["工作台", "今日处理"],
  imports: ["数据管理", "日数据导入"],
  anchors: ["账户管理", "主播与余额"],
  withdrawals: ["资金处理", "提现记录"],
};
const statusText = {
  PENDING_REVIEW: "待审核",
  APPROVED: "已通过",
  REJECTED: "已驳回",
  PENDING_PAYOUT: "待打款",
  SUCCESS: "已成功",
  ACTIVE: "生效中",
  DELETED: "已删除",
  SIGNED: "已签约",
  SIGNING: "签约中",
  UNSIGNED: "未签约",
  RELEASED: "已解约",
  MISSING: "未提交",
};
const statusClass = (value) =>
  ["APPROVED", "SUCCESS", "SIGNED", "ACTIVE"].includes(value)
    ? "good"
    : ["REJECTED", "DELETED", "RELEASED"].includes(value)
      ? "bad"
      : "warn";
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>'"]/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        char
      ],
  );
const money = (cents) =>
  `¥${(Number(cents || 0) / 100).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateTime = (value) =>
  value
    ? new Date(value).toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        hour12: false,
      })
    : "—";
const dateOnly = (value) => (value ? String(value).slice(0, 10) : "—");
const badge = (value) =>
  `<span class="badge ${statusClass(value)}">${esc(statusText[value] || value || "—")}</span>`;

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...options.headers,
    },
  });
  const payload = await response
    .json()
    .catch(() => ({ ok: false, error: { message: "服务器返回格式异常" } }));
  if (response.status === 401 && state.token) {
    logout(false);
    throw new Error("登录已失效，请重新登录");
  }
  if (!response.ok || !payload.ok) {
    const error = new Error(
      payload.error?.userMessage || payload.error?.message || "操作失败",
    );
    error.details = payload.error?.details;
    throw error;
  }
  return payload.data;
}
function notify(message, type = "") {
  const toast = $("#toast");
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.hidden = false;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => (toast.hidden = true), 3200);
}
function showError(error) {
  const firstDetail = Array.isArray(error.details) ? error.details[0] : null;
  const detailText = firstDetail?.row
    ? `（第 ${firstDetail.row} 行：${firstDetail.message}）`
    : "";
  notify(`${error.message || "操作失败"}${detailText}`, "error");
}
function openModal(html) {
  modalContent.innerHTML = `<div class="modal-body">${html}</div>`;
  modal.showModal();
}
function closeModal() {
  modal.close();
  modalContent.innerHTML = "";
}
modal.addEventListener("click", (event) => {
  if (event.target === modal) closeModal();
});
function actionButtons(
  cancel = "取消",
  confirm = "确认",
  id = "modal-confirm",
  danger = false,
) {
  return `<div class="modal-actions"><button class="button" data-modal-close>${cancel}</button><button id="${id}" class="button ${danger ? "danger" : "primary"}">${confirm}</button></div>`;
}
document.addEventListener("click", (event) => {
  if (event.target.closest("[data-modal-close]")) closeModal();
});

async function bootstrap() {
  if (!state.token) return showLogin();
  try {
    const session = await api("/api/admin/v2/session");
    state.account = session.account;
    showApp();
    await renderPage();
  } catch {
    showLogin();
  }
}
function showLogin() {
  $("#login").hidden = false;
  $("#shell").hidden = true;
}
function clearLoginForm() {
  $("#login-form").reset();
}
function showApp() {
  $("#login").hidden = true;
  $("#shell").hidden = false;
  $("#account-name").textContent = state.account?.username || "管理员";
}
async function logout(callApi = true) {
  if (callApi && state.token)
    await api("/api/admin/v2/auth/logout", {
      method: "POST",
      body: "{}",
    }).catch(() => {});
  state.token = "";
  state.account = null;
  sessionStorage.removeItem("adminToken");
  clearLoginForm();
  showLogin();
}
$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  try {
    const form = new FormData(event.currentTarget);
    const result = await api("/api/admin/v2/auth/login", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(form)),
    });
    state.token = result.token;
    state.account = result.account;
    sessionStorage.setItem("adminToken", state.token);
    clearLoginForm();
    showApp();
    await renderPage();
  } catch (error) {
    showError(error);
  } finally {
    button.disabled = false;
  }
});
$("#nav").addEventListener("click", (event) => {
  const button = event.target.closest("[data-page]");
  if (!button) return;
  state.page = button.dataset.page;
  renderPage();
});
$("#account-button").addEventListener(
  "click",
  () => ($("#account-menu").hidden = !$("#account-menu").hidden),
);
$("#account-menu").addEventListener("click", (event) => {
  const action = event.target.dataset.action;
  $("#account-menu").hidden = true;
  if (action === "logout") logout();
  if (action === "admins") showAdmins();
  if (action === "audit") showAudit();
});

async function renderPage() {
  document
    .querySelectorAll(".nav-item")
    .forEach((item) =>
      item.classList.toggle("active", item.dataset.page === state.page),
    );
  const [kicker, title] = pageMeta[state.page];
  $("#page-kicker").textContent = kicker;
  $("#page-title").textContent = title;
  content.innerHTML = '<div class="empty">正在加载…</div>';
  try {
    await {
      today: renderToday,
      imports: renderImports,
      anchors: renderAnchors,
      withdrawals: renderWithdrawals,
    }[state.page]();
  } catch (error) {
    content.innerHTML = `<div class="card empty">${esc(error.message)}</div>`;
    showError(error);
  }
}

async function renderToday() {
  const [dashboard, payments] = await Promise.all([
    api("/api/admin/v2/dashboard"),
    api("/api/admin/v2/payment-requests?status=PENDING_REVIEW"),
  ]);
  const summary = Object.fromEntries(
    (dashboard.withdrawalSummary || []).map((row) => [row.status, row]),
  );
  const window = dashboard.withdrawWindow;
  content.innerHTML = `
    <div class="status-banner ${window.isOpen ? "open" : ""}"><div><strong>${window.isOpen ? "提现通道开放中" : "当前禁止提现"}</strong><p>固定开放时段 08:00–16:00 · 北京时间 · ${esc(window.businessDate)}</p></div><div class="dot"></div></div>
    <div class="grid cols-4 section">
      ${metric("待审核收款信息", dashboard.pendingPaymentCount, "需要人工确认")}
      ${metric("今日待打款", summary.PENDING_PAYOUT?.count || 0, money(summary.PENDING_PAYOUT?.amount_cents))}
      ${metric("今日已成功", summary.SUCCESS?.count || 0, money(summary.SUCCESS?.amount_cents))}
      ${metric("账户总余额", money(dashboard.balanceSummary.totalCents), `${dashboard.balanceSummary.accountCount} 个主播账户`)}
    </div>
    <section class="card section"><div class="section-head"><h2>待审核收款信息</h2><button class="button" id="calendar-settings">提现日设置</button></div>${paymentTable(payments)}</section>
    <section class="card section"><div class="section-head"><h2>最近导入</h2><button class="link" data-jump="imports">查看全部</button></div>${dashboard.recentImports.length ? `<div class="table-wrap"><table><thead><tr><th>归属日期</th><th>文件</th><th>行数</th><th>总金额</th><th>导入时间</th></tr></thead><tbody>${dashboard.recentImports.map((row) => `<tr><td>${dateOnly(row.business_date)}</td><td>${esc(row.file_name)}</td><td>${row.row_count}</td><td class="money">${money(row.total_amount_cents)}</td><td>${dateTime(row.created_at)}</td></tr>`).join("")}</tbody></table></div>` : '<div class="empty">还没有导入记录</div>'}</section>`;
  bindPaymentActions();
  $("#calendar-settings").onclick = showCalendar;
  document.querySelectorAll("[data-jump]").forEach(
    (button) =>
      (button.onclick = () => {
        state.page = button.dataset.jump;
        renderPage();
      }),
  );
}
function metric(label, value, note) {
  return `<article class="card card-pad metric"><label>${label}</label><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`;
}
function paymentTable(rows) {
  if (!rows.length) return '<div class="empty">没有待审核记录</div>';
  return `<div class="table-wrap"><table><thead><tr><th>主播</th><th>姓名</th><th>身份证号</th><th>手机号</th><th>银行卡号</th><th>提交时间</th><th>操作</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${esc(row.display_name)}<br><span class="small muted">ID ${esc(row.bixin_user_id)}</span></td><td>${esc(row.real_name)}</td><td class="nowrap">${esc(row.id_card_no)}</td><td>${esc(row.payment_mobile)}</td><td>${esc(row.bank_card_no)}</td><td>${dateTime(row.created_at)}</td><td class="nowrap"><button class="link" data-payment-approve="${row.request_id}">通过</button>　<button class="link danger-text" data-payment-reject="${row.request_id}">驳回</button></td></tr>`).join("")}</tbody></table></div>`;
}
function bindPaymentActions() {
  document
    .querySelectorAll("[data-payment-approve]")
    .forEach(
      (button) =>
        (button.onclick = () =>
          reviewPayment(button.dataset.paymentApprove, "APPROVED")),
    );
  document
    .querySelectorAll("[data-payment-reject]")
    .forEach(
      (button) =>
        (button.onclick = () =>
          reviewPayment(button.dataset.paymentReject, "REJECTED")),
    );
}
function reviewPayment(requestId, decision) {
  openModal(
    `<h2>${decision === "APPROVED" ? "确认通过" : "驳回收款信息"}</h2><p class="muted">${decision === "APPROVED" ? "通过后主播可以继续完成云账户签约。" : "可选择填写驳回原因。"}</p><label class="field">原因（选填）<textarea id="review-reason" placeholder="请输入原因"></textarea></label>${actionButtons("取消", decision === "APPROVED" ? "确认通过" : "确认驳回", "review-confirm", decision !== "APPROVED")}`,
  );
  $("#review-confirm").onclick = async () => {
    try {
      await api(`/api/admin/v2/payment-requests/${requestId}/review`, {
        method: "POST",
        body: JSON.stringify({ decision, reason: $("#review-reason").value }),
      });
      closeModal();
      notify("审核结果已保存");
      renderPage();
    } catch (error) {
      showError(error);
    }
  };
}

async function showCalendar() {
  const data = await api("/api/admin/v2/calendar");
  const names = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const selected = Array(7).fill(true);
  data.weekdays.forEach(
    (item) => (selected[item.weekday] = Boolean(item.is_open)),
  );
  openModal(
    `<h2>提现日设置</h2><p class="muted">特殊日期优先于每周规则；当天 08:00 后锁定。</p><div class="calendar-days">${names.map((name, index) => `<button class="day-toggle ${selected[index] ? "active" : ""}" data-weekday="${index}">${name}<br><span class="small">${selected[index] ? "开放" : "关闭"}</span></button>`).join("")}</div><div class="split"><label class="field">特殊日期<input id="override-date" type="date"></label><label class="field">状态<select id="override-open"><option value="true">开放</option><option value="false">关闭</option></select></label></div>${actionButtons("关闭", "保存每周规则", "calendar-save")}<div class="modal-actions"><button class="button" id="override-save">保存特殊日期</button></div>`,
  );
  document.querySelectorAll("[data-weekday]").forEach(
    (button) =>
      (button.onclick = () => {
        const index = Number(button.dataset.weekday);
        selected[index] = !selected[index];
        button.classList.toggle("active", selected[index]);
        button.querySelector("span").textContent = selected[index]
          ? "开放"
          : "关闭";
      }),
  );
  $("#calendar-save").onclick = async () => {
    try {
      await api("/api/admin/v2/calendar/weekdays", {
        method: "PUT",
        body: JSON.stringify({ weekdays: selected }),
      });
      closeModal();
      notify("每周规则已保存");
      renderPage();
    } catch (error) {
      showError(error);
    }
  };
  $("#override-save").onclick = async () => {
    const date = $("#override-date").value;
    if (!date) return notify("请选择特殊日期", "error");
    try {
      await api(`/api/admin/v2/calendar/override/${date}`, {
        method: "PUT",
        body: JSON.stringify({ isOpen: $("#override-open").value === "true" }),
      });
      closeModal();
      notify("特殊日期已保存");
      renderPage();
    } catch (error) {
      showError(error);
    }
  };
}

async function renderImports() {
  const rows = await api("/api/admin/v2/imports");
  content.innerHTML = `<section class="card"><div class="section-head"><div><h2>上传比心日数据</h2><span class="small muted">支持 .xlsx，日期自动从文件名识别</span></div></div><div class="dropzone"><input id="import-file" type="file" accept=".xlsx"><h3>选择当天的详情数据</h3><p>先预览校验，确认后才会入账；同一天不能覆盖。</p><button class="button primary" id="choose-file">选择 Excel 文件</button><div id="chosen-file" class="small muted" style="margin-top:12px"></div></div><div id="import-preview"></div></section><section class="card section"><div class="section-head"><h2>导入记录</h2></div>${rows.length ? `<div class="table-wrap"><table><thead><tr><th>归属日期</th><th>文件名</th><th>行数</th><th>总星动值</th><th>金额</th><th>状态</th><th>操作</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${dateOnly(row.business_date)}</td><td>${esc(row.file_name)}</td><td>${row.row_count}</td><td>${Number(row.total_star).toLocaleString()}</td><td class="money">${money(row.total_amount_cents)}</td><td>${badge(row.status)}</td><td>${row.status === "ACTIVE" ? `<button class="link danger-text" data-delete-import="${row.import_id}">整体删除</button>` : "—"}</td></tr>`).join("")}</tbody></table></div>` : '<div class="empty">还没有导入记录</div>'}</section>`;
  $("#choose-file").onclick = () => $("#import-file").click();
  $("#import-file").onchange = handleImportFile;
  document
    .querySelectorAll("[data-delete-import]")
    .forEach(
      (button) =>
        (button.onclick = () => deleteImport(button.dataset.deleteImport)),
    );
}
async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
async function handleImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  $("#chosen-file").textContent = file.name;
  try {
    const contentBase64 = await fileToBase64(file);
    state.importFile = { fileName: file.name, contentBase64 };
    state.importPreview = await api("/api/admin/v2/imports/preview", {
      method: "POST",
      body: JSON.stringify(state.importFile),
    });
    const preview = state.importPreview;
    $("#import-preview").innerHTML =
      `<div class="preview"><div class="preview-grid"><div><label>归属日期</label><strong>${preview.businessDate}</strong></div><div><label>总行数</label><strong>${preview.rowCount}</strong></div><div><label>正收入</label><strong>${preview.positiveCount}</strong></div><div><label>零收入</label><strong>${preview.zeroCount}</strong></div><div><label>入账总额</label><strong>${money(preview.totalAmountCents)}</strong></div></div><div class="modal-actions"><button class="button primary" id="confirm-import">确认导入并入账</button></div></div>`;
    $("#confirm-import").onclick = confirmImport;
  } catch (error) {
    state.importFile = null;
    state.importPreview = null;
    showError(error);
  }
}
async function confirmImport() {
  const button = $("#confirm-import");
  button.disabled = true;
  try {
    await api("/api/admin/v2/imports/confirm", {
      method: "POST",
      body: JSON.stringify({
        ...state.importFile,
        businessDate: state.importPreview.businessDate,
        expectedFileHash: state.importPreview.fileHash,
      }),
    });
    state.importFile = null;
    state.importPreview = null;
    notify("日数据已导入并完成入账");
    renderPage();
  } catch (error) {
    showError(error);
    button.disabled = false;
  }
}
function deleteImport(importId) {
  openModal(
    `<h2>整体删除已上传表格</h2><p class="muted">系统会撤销这份表产生的余额，但不会取消已经获得的注册资格。资金已被使用时将阻止删除。</p><label class="field">输入“删除”确认<input id="delete-text" autocomplete="off"></label>${actionButtons("取消", "确认删除", "delete-import-confirm", true)}`,
  );
  $("#delete-import-confirm").onclick = async () => {
    try {
      await api(`/api/admin/v2/imports/${importId}`, {
        method: "DELETE",
        body: JSON.stringify({ confirmText: $("#delete-text").value }),
      });
      closeModal();
      notify("已整体删除并完成余额撤销");
      renderPage();
    } catch (error) {
      showError(error);
    }
  };
}

async function renderAnchors() {
  const data = await api(
    `/api/admin/v2/anchors?q=${encodeURIComponent(state.anchorQuery)}&page=${state.anchorPage}&pageSize=30`,
  );
  content.innerHTML = `<section class="card"><div class="section-head"><h2>主播账户</h2><form id="anchor-search" class="toolbar"><input name="q" value="${esc(state.anchorQuery)}" placeholder="搜索比心 ID、原账号、姓名、手机号"><button class="button">搜索</button></form></div>${data.rows.length ? `<div class="table-wrap"><table><thead><tr><th>比心 ID</th><th>主播</th><th>手机号</th><th>余额</th><th>收款信息</th><th>云账户</th><th>操作</th></tr></thead><tbody>${data.rows.map((row) => `<tr><td>${esc(row.bixin_user_id || "—")}</td><td>${esc(row.display_name)}</td><td>${esc(row.mobile)}</td><td class="money">${money(row.balance_cents)}</td><td>${badge(row.payment_status)}</td><td>${badge(row.sign_status)}</td><td class="nowrap"><button class="link" data-anchor-detail="${row.anchor_id}">查看详情</button>　<button class="link" data-adjust="${row.anchor_id}">调余额</button></td></tr>`).join("")}</tbody></table></div><div class="pagination"><button class="button" id="anchor-prev" ${state.anchorPage === 1 ? "disabled" : ""}>上一页</button><span>第 ${state.anchorPage} 页</span><button class="button" id="anchor-next" ${data.rows.length < 30 ? "disabled" : ""}>下一页</button></div>` : '<div class="empty">没有找到主播</div>'}</section>`;
  $("#anchor-search").onsubmit = (event) => {
    event.preventDefault();
    state.anchorQuery = new FormData(event.currentTarget).get("q");
    state.anchorPage = 1;
    renderPage();
  };
  $("#anchor-prev") &&
    ($("#anchor-prev").onclick = () => {
      state.anchorPage--;
      renderPage();
    });
  $("#anchor-next") &&
    ($("#anchor-next").onclick = () => {
      state.anchorPage++;
      renderPage();
    });
  document
    .querySelectorAll("[data-anchor-detail]")
    .forEach(
      (button) =>
        (button.onclick = () => showAnchor(button.dataset.anchorDetail)),
    );
  document
    .querySelectorAll("[data-adjust]")
    .forEach(
      (button) => (button.onclick = () => adjustBalance(button.dataset.adjust)),
    );
}
async function showAnchor(anchorId) {
  try {
    const data = await api(`/api/admin/v2/anchors/${anchorId}`);
    const anchor = data.anchor;
    const payment = data.paymentRequests[0];
    openModal(
      `<h2>${esc(anchor.display_name)}</h2><p class="muted">比心 ID ${esc(anchor.bixin_user_id || "—")}</p><dl class="details"><dt>原登录账号</dt><dd>${esc(anchor.legacy_login_account || "—")}</dd><dt>登录手机号</dt><dd>${esc(anchor.mobile || "—")}</dd><dt>可用余额</dt><dd class="money">${money(anchor.balance_cents)}</dd><dt>云账户签约</dt><dd>${badge(anchor.sign_status)}</dd><dt>真实姓名</dt><dd>${esc(payment?.real_name || "未提交")}</dd><dt>身份证号</dt><dd>${esc(payment?.id_card_no || "未提交")}</dd><dt>收款手机号</dt><dd>${esc(payment?.payment_mobile || "未提交")}</dd><dt>银行卡号</dt><dd>${esc(payment?.bank_card_no || "未提交")}</dd></dl><h3>最近余额流水</h3>${
        data.balanceFlows.length
          ? `<div class="table-wrap"><table><thead><tr><th>类型</th><th>金额</th><th>变动后余额</th><th>原因</th><th>时间</th></tr></thead><tbody>${data.balanceFlows
              .slice(0, 20)
              .map(
                (row) =>
                  `<tr><td>${esc(row.flow_type)}</td><td class="money">${row.direction === "OUT" ? "-" : "+"}${money(row.amount_cents)}</td><td>${money(row.balance_after_cents)}</td><td>${esc(row.reason || "—")}</td><td>${dateTime(row.created_at)}</td></tr>`,
              )
              .join("")}</tbody></table></div>`
          : '<div class="empty">暂无流水</div>'
      }${actionButtons("关闭", "调整余额", "detail-adjust")}`,
    );
    $("#detail-adjust").onclick = () => {
      closeModal();
      adjustBalance(anchorId);
    };
  } catch (error) {
    showError(error);
  }
}
function adjustBalance(anchorId) {
  openModal(
    `<h2>手动调整余额</h2><p class="muted">正数增加，负数扣减。允许形成负余额，后续收入会自动抵扣。</p><label class="field">调整金额（元）<input id="adjust-amount" type="number" step="0.01" placeholder="例如 100 或 -50"></label><label class="field">调整原因（必填）<textarea id="adjust-reason"></textarea></label>${actionButtons("取消", "保存调整", "adjust-confirm")}`,
  );
  $("#adjust-confirm").onclick = async () => {
    const amount = Number($("#adjust-amount").value);
    try {
      await api(`/api/admin/v2/anchors/${anchorId}/balance-adjustments`, {
        method: "POST",
        body: JSON.stringify({
          amountCents: Math.round(amount * 100),
          reason: $("#adjust-reason").value,
        }),
      });
      closeModal();
      notify("余额已调整");
      renderPage();
    } catch (error) {
      showError(error);
    }
  };
}

async function renderWithdrawals() {
  const rows = await api(
    `/api/admin/v2/withdrawals?date=${state.withdrawDate}`,
  );
  const pending = rows.filter((row) => row.status === "PENDING_PAYOUT");
  const pendingTotal = pending.reduce(
    (sum, row) => sum + Number(row.amount_cents),
    0,
  );
  const exported = pending.some((row) => row.export_id);
  content.innerHTML = `<div class="grid cols-4"><article class="card card-pad metric"><label>所选日期</label><strong>${state.withdrawDate}</strong><small>16:00 后可下载表格</small></article>${metric("总申请", rows.length, money(rows.reduce((sum, row) => sum + Number(row.amount_cents), 0)))}${metric("待打款", pending.length, money(pendingTotal))}${metric("处理状态", exported ? "已导出" : "未导出", exported ? "可驳回或全部成功" : "请先下载请求表")}</div><section class="card section"><div class="section-head"><h2>提现申请</h2><div class="toolbar"><input id="withdraw-date" type="date" value="${state.withdrawDate}"><button class="button" id="export-withdraw">下载请求表</button><button class="button primary" id="all-success" ${!pending.length || !exported ? "disabled" : ""}>剩余全部成功</button></div></div>${rows.length ? `<div class="table-wrap"><table><thead><tr><th>主播</th><th>姓名 / 身份证</th><th>银行卡</th><th>金额</th><th>状态</th><th>申请时间</th><th>操作</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${esc(row.display_name)}<br><span class="small muted">ID ${esc(row.bixin_user_id)}</span></td><td>${esc(row.real_name || "—")}<br><span class="small muted">${esc(row.id_card_no || "—")}</span></td><td>${esc(row.bank_card_no || "—")}</td><td class="money">${money(row.amount_cents)}</td><td>${badge(row.status)}${row.reject_reason ? `<br><span class="small muted">${esc(row.reject_reason)}</span>` : ""}</td><td>${dateTime(row.created_at)}</td><td>${row.status === "PENDING_PAYOUT" && row.export_id ? `<button class="link danger-text" data-reject-withdraw="${row.apply_id}" data-amount="${row.amount_cents}">驳回</button>` : "—"}</td></tr>`).join("")}</tbody></table></div>` : '<div class="empty">该日期没有提现申请</div>'}</section>`;
  $("#withdraw-date").onchange = (event) => {
    state.withdrawDate = event.target.value;
    renderPage();
  };
  $("#export-withdraw").onclick = exportWithdrawals;
  $("#all-success").onclick = () => allSuccess(pending.length, pendingTotal);
  document
    .querySelectorAll("[data-reject-withdraw]")
    .forEach(
      (button) =>
        (button.onclick = () =>
          rejectWithdrawal(
            button.dataset.rejectWithdraw,
            Number(button.dataset.amount),
          )),
    );
}
async function exportWithdrawals() {
  try {
    const result = await api("/api/admin/v2/withdrawals/export", {
      method: "POST",
      body: JSON.stringify({ businessDate: state.withdrawDate }),
    });
    result.files.forEach((file) => {
      const bytes = Uint8Array.from(atob(file.contentBase64), (char) =>
        char.charCodeAt(0),
      );
      const link = document.createElement("a");
      link.href = URL.createObjectURL(
        new Blob([bytes], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );
      link.download = file.fileName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    });
    notify(`已下载 ${result.files.length} 个打款表`);
    renderPage();
  } catch (error) {
    showError(error);
  }
}
function rejectWithdrawal(applyId, amountCents) {
  openModal(
    `<h2>驳回这笔提现</h2><p>将恢复主播余额 <strong>${money(amountCents)}</strong>。驳回后，主播只能在下一个开放日再次申请。</p><label class="field">原因（选填）<textarea id="reject-reason"></textarea></label>${actionButtons("取消", "确认驳回并恢复余额", "reject-confirm", true)}`,
  );
  $("#reject-confirm").onclick = async () => {
    try {
      const result = await api(`/api/admin/v2/withdrawals/${applyId}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason: $("#reject-reason").value }),
      });
      closeModal();
      notify(`已驳回，当前余额 ${money(result.balanceCents)}`);
      renderPage();
    } catch (error) {
      showError(error);
    }
  };
}
function allSuccess(count, total) {
  openModal(
    `<h2>确认剩余全部成功</h2><p>所选日期剩余 <strong>${count}</strong> 笔，合计 <strong>${money(total)}</strong>。</p><p class="muted">完成后不可撤销。请确认线下打款已全部成功。</p>${actionButtons("取消", "确认全部成功", "success-confirm")}`,
  );
  $("#success-confirm").onclick = async () => {
    try {
      await api("/api/admin/v2/withdrawals/all-success", {
        method: "POST",
        body: JSON.stringify({ businessDate: state.withdrawDate }),
      });
      closeModal();
      notify("剩余提现已全部标记成功");
      renderPage();
    } catch (error) {
      showError(error);
    }
  };
}

async function showAdmins() {
  try {
    const rows = await api("/api/admin/v2/admin-accounts");
    openModal(
      `<h2>超级管理员</h2><p class="muted">所有账号拥有相同权限。</p><div class="table-wrap"><table><thead><tr><th>用户名</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${esc(row.username)}</td><td>${badge(row.status)}</td><td>${dateTime(row.created_at)}</td><td><button class="link" data-admin-toggle="${row.account_id}" data-status="${row.status}">${row.status === "ACTIVE" ? "停用" : "启用"}</button></td></tr>`).join("")}</tbody></table></div><div class="split section"><label class="field">新用户名<input id="new-admin-name" name="new-admin-username" autocomplete="off"></label><label class="field">初始密码（至少 8 位）<input id="new-admin-password" name="new-admin-password" type="password" autocomplete="new-password"></label></div>${actionButtons("关闭", "创建管理员", "admin-create")}`,
    );
    $("#admin-create").onclick = async () => {
      try {
        await api("/api/admin/v2/admin-accounts", {
          method: "POST",
          body: JSON.stringify({
            username: $("#new-admin-name").value,
            password: $("#new-admin-password").value,
          }),
        });
        closeModal();
        notify("超级管理员已创建");
        showAdmins();
      } catch (error) {
        showError(error);
      }
    };
    document.querySelectorAll("[data-admin-toggle]").forEach(
      (button) =>
        (button.onclick = async () => {
          try {
            await api(
              `/api/admin/v2/admin-accounts/${button.dataset.adminToggle}`,
              {
                method: "PATCH",
                body: JSON.stringify({
                  status:
                    button.dataset.status === "ACTIVE" ? "DISABLED" : "ACTIVE",
                }),
              },
            );
            closeModal();
            showAdmins();
          } catch (error) {
            showError(error);
          }
        }),
    );
  } catch (error) {
    showError(error);
  }
}
async function showAudit() {
  try {
    const rows = await api("/api/admin/v2/audit");
    openModal(
      `<h2>永久审计记录</h2><p class="muted">最近 500 条，只读且不可删除。</p><div class="table-wrap"><table><thead><tr><th>时间</th><th>操作者</th><th>动作</th><th>目标</th><th>IP</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${dateTime(row.created_at)}</td><td>${esc(row.actor_type)} / ${esc(row.actor_id)}</td><td>${esc(row.action)}</td><td>${esc(row.target_type)} / ${esc(row.target_id)}</td><td>${esc(row.ip_address || "—")}</td></tr>`).join("")}</tbody></table></div>${actionButtons("关闭", "关闭", "audit-close")}`,
    );
    $("#audit-close").onclick = closeModal;
  } catch (error) {
    showError(error);
  }
}

bootstrap();
