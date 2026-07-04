function normalizeDigits(value) {
  return String(value || "").replace(/\s+/g, "");
}

function isValidMainlandIdCard(value) {
  const text = String(value || "").trim().toUpperCase();
  if (!/^\d{17}[\dX]$/.test(text)) return false;
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const checks = ["1", "0", "X", "9", "8", "7", "6", "5", "4", "3", "2"];
  const sum = weights.reduce((total, weight, index) => total + Number(text[index]) * weight, 0);
  return checks[sum % 11] === text[17];
}

function isValidMobile(value) {
  return /^1[3-9]\d{9}$/.test(normalizeDigits(value));
}

function isValidBankCard(value) {
  const text = normalizeDigits(value);
  if (!/^\d{12,19}$/.test(text)) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let index = text.length - 1; index >= 0; index -= 1) {
    let digit = Number(text[index]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

function parseAmountYuanToCents(value) {
  const text = String(value || "").trim();
  if (!text) {
    throw new Error("请输入提现金额");
  }
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    throw new Error("提现金额最多支持两位小数");
  }
  const [yuan, cents = ""] = text.split(".");
  return Number(yuan) * 100 + Number(cents.padEnd(2, "0"));
}

function normalizePaymentInfoForm(form) {
  return {
    realName: String(form.realName || "").trim(),
    idCardNo: String(form.idCardNo || "").trim().toUpperCase(),
    paymentMobile: normalizeDigits(form.paymentMobile),
    bankCardNo: normalizeDigits(form.bankCardNo),
  };
}

function validatePaymentInfoForm(form) {
  if (!form.realName) throw new Error("请输入姓名");
  if (!isValidMainlandIdCard(form.idCardNo)) throw new Error("请输入正确的 18 位身份证号");
  if (!isValidMobile(form.paymentMobile)) throw new Error("请输入正确的 11 位手机号");
  if (!isValidBankCard(form.bankCardNo)) throw new Error("请输入正确的银行卡号");
}

function normalizeSignIdentityForm(form) {
  return {
    realName: String(form.realName || "").trim(),
    idCardNo: String(form.idCardNo || "").trim().toUpperCase(),
  };
}

function validateSignIdentityForm(form) {
  if (!form.realName) throw new Error("请输入签约人姓名");
  if (!isValidMainlandIdCard(form.idCardNo)) throw new Error("请输入正确的签约人身份证号");
}

module.exports = {
  isValidBankCard,
  isValidMainlandIdCard,
  isValidMobile,
  normalizeDigits,
  normalizePaymentInfoForm,
  normalizeSignIdentityForm,
  parseAmountYuanToCents,
  validatePaymentInfoForm,
  validateSignIdentityForm,
};
