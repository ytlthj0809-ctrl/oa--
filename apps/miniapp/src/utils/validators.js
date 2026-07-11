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

const paymentInfoFieldValidators = Object.freeze({
  realName(value) {
    const text = String(value || "").trim();
    if (!text) return "请输入真实姓名";
    if (text.length < 2) return "姓名至少 2 个字";
    return "";
  },
  idCardNo(value) {
    if (!value) return "请输入身份证号";
    if (!isValidMainlandIdCard(value)) return "请输入有效的 18 位身份证号";
    return "";
  },
  paymentMobile(value) {
    if (!value) return "请输入手机号";
    if (!isValidMobile(value)) return "请输入有效的 11 位手机号";
    return "";
  },
  bankCardNo(value) {
    if (!value) return "请输入银行卡号";
    if (!isValidBankCard(value)) return "请输入有效的银行卡号";
    return "";
  },
});

function parseAmountYuanToCents(value) {
  const text = String(value || "").trim();
  if (!text) {
    throw new Error("请输入提现金额");
  }
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    throw new Error("提现金额最多支持两位小数");
  }
  const [yuan, cents = ""] = text.split(".");
  const normalizedYuan = yuan.replace(/^0+(?=\d)/, "");
  const centsText = `${normalizedYuan}${cents.padEnd(2, "0")}`.replace(/^0+(?=\d)/, "");
  const maxSafeCents = String(Number.MAX_SAFE_INTEGER);
  if (
    centsText.length > maxSafeCents.length
    || (centsText.length === maxSafeCents.length && centsText > maxSafeCents)
  ) {
    throw new Error("提现金额超出安全范围");
  }
  return Number(centsText);
}

function normalizePaymentInfoForm(form) {
  return {
    realName: String(form.realName || "").trim(),
    idCardNo: String(form.idCardNo || "").trim().toUpperCase(),
    paymentMobile: normalizeDigits(form.paymentMobile),
    bankCardNo: normalizeDigits(form.bankCardNo),
  };
}

function normalizePaymentInfoPatch(form = {}) {
  const normalized = normalizePaymentInfoForm(form);
  return Object.keys(normalized).reduce((patch, field) => {
    if (normalized[field]) patch[field] = normalized[field];
    return patch;
  }, {});
}

function validatePaymentInfoForm(form) {
  Object.entries(paymentInfoFieldValidators).forEach(([field, validator]) => {
    const error = validator(form[field]);
    if (error) throw new Error(error);
  });
}

function validatePaymentInfoPatch(patch) {
  const fields = Object.keys(patch || {});
  if (!fields.length) throw new Error("请至少填写一项需要修改的打款信息");
  fields.forEach((field) => {
    const validator = paymentInfoFieldValidators[field];
    if (!validator) return;
    const error = validator(patch[field]);
    if (error) throw new Error(error);
  });
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
  normalizePaymentInfoPatch,
  normalizeSignIdentityForm,
  parseAmountYuanToCents,
  paymentInfoFieldValidators,
  validatePaymentInfoForm,
  validatePaymentInfoPatch,
  validateSignIdentityForm,
};
