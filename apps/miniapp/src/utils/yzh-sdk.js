const yzhAssistantAppId = "wx9518fe08d36ee44e";
const yzhSignPath = "pages/api-sign/index";

let initialized = false;
let yzhCallbackContext = null;

function getWx() {
  if (typeof wx === "undefined") return null;
  return wx;
}

function isYzhAssistantReturn(options = {}) {
  const scene = Number(options.scene || 0);
  const referrerInfo = options.referrerInfo || {};
  const expectedAppId = yzhCallbackContext?.appId || yzhAssistantAppId;
  return scene === 1038 && referrerInfo.appId === expectedAppId;
}

function handleYzhAppShow(options = {}) {
  const wxApi = getWx();
  if (!wxApi || !isYzhAssistantReturn(options)) return false;
  if (!yzhCallbackContext || typeof yzhCallbackContext.verifyDoneCallback !== "function") return true;
  const extraData = (options.referrerInfo && options.referrerInfo.extraData) || {};
  const resultUrl = extraData.url || yzhCallbackContext.signUrl;
  const verifyDone = Object.prototype.hasOwnProperty.call(extraData, "verifyDone")
    ? Boolean(extraData.verifyDone)
    : true;
  const { verifyDoneCallback } = yzhCallbackContext;
  yzhCallbackContext = null;
  verifyDoneCallback({ url: resultUrl, verifyDone, raw: extraData });
  return true;
}

function initYzhSdk() {
  const wxApi = getWx();
  if (!wxApi || initialized) return;
  initialized = true;
  if (typeof wxApi.onAppShow === "function") {
    wxApi.onAppShow(handleYzhAppShow);
  }
}

function clearYzhSdkContext() {
  yzhCallbackContext = null;
}

function showYzhModal(content) {
  const wxApi = getWx();
  if (wxApi && typeof wxApi.showModal === "function") {
    wxApi.showModal({ title: "提示", content, showCancel: false });
  }
}

function startYzhSdk(options = {}) {
  const wxApi = getWx();
  const {
    data,
    verifyDoneCallback,
    appId = yzhAssistantAppId,
    path = yzhSignPath,
    envVersion = "release",
    onNavigateSuccess,
    onNavigateFail,
  } = options;

  if (!data || typeof verifyDoneCallback !== "function") {
    showYzhModal("传入的云账户签约参数有误");
    return false;
  }

  const signUrl = data.url || "";
  if (!signUrl) {
    showYzhModal("传入的云账户签约链接有误");
    return false;
  }

  if (!wxApi || typeof wxApi.navigateToMiniProgram !== "function") {
    if (typeof onNavigateFail === "function") onNavigateFail(new Error("navigateToMiniProgram unavailable"));
    return false;
  }

  yzhCallbackContext = { appId, signUrl, verifyDoneCallback };

  wxApi.navigateToMiniProgram({
    appId,
    path,
    envVersion,
    extraData: {
      YZHhuiyan: true,
      url: signUrl,
    },
    success(result) {
      if (typeof onNavigateSuccess === "function") onNavigateSuccess(result);
    },
    fail(error) {
      yzhCallbackContext = null;
      if (typeof onNavigateFail === "function") onNavigateFail(error);
    },
  });
  return true;
}

module.exports = {
  clearYzhSdkContext,
  handleYzhAppShow,
  initYzhSdk,
  isYzhAssistantReturn,
  startYzhSdk,
  yzhAssistantAppId,
};
