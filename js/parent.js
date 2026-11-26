const radioMuni = document.getElementById("radioMuni");
const radioDecision = document.getElementById("radioDecision");
const inputMuniCode = document.getElementById("inputMuniCode");
const inputKrokino = document.getElementById("inputKrokino");
const fetchContextBtn = document.getElementById("fetchContextBtn");
const gisIframe = document.getElementById("gisIframe");

const planValidationViewer = document.getElementById("planValidationViewer");
const jsonViewer = document.getElementById("jsonViewer");
const validationViewer = document.getElementById("validationViewer");

radioMuni.addEventListener("change", () => {
  inputMuniCode.style.display = "block";
  inputKrokino.style.display = "none";
});
radioDecision.addEventListener("change", () => {
  inputMuniCode.style.display = "none";
  inputKrokino.style.display = "block";
});

//^ send postMessage to iframe when btn clicked
fetchContextBtn.addEventListener("click", () => {
  if (radioMuni.checked) {
    const code = inputMuniCode.value.trim();
    if (!code) return;
    gisIframe.contentWindow.postMessage(
      {
        target: "GIS",
        command: "LOAD_MUNICIPALITY",
        code: code,
      },
      "*",
    );
  } else {
    const krokino = inputKrokino.value.trim();
    if (!krokino) return;
    gisIframe.contentWindow.postMessage(
      {
        target: "GIS",
        command: "LOAD_DECISION",
        code: krokino,
      },
      "*",
    );
  }
});

//^ render JSON formatted data
function renderJsonFormatted(container, payloadObj) {
  container.innerHTML = "";
  const formatter = new JSONFormatter(payloadObj, 2, {
    // hoverPreviewEnabled: true,
    animateOpen: true,
    animateClose: true,
  });
  container.appendChild(formatter.render());
}

//^ setup incoming messages from iframe
window.addEventListener("message", (event) => {
  const data = event.data;

  if (!data || data.source !== "GIS") return;

  const { action, payload } = data;

  switch (action) {
    case "LOADING_STARTED":
      planValidationViewer.innerHTML = `<div class="waiting-text">جاري تحميل البيانات للكود (${payload?.code})...</div>`;
      break;

    case "CONTEXT_LOADED":
      renderJsonFormatted(planValidationViewer, payload);
      break;

    case "PLAN_PROCESSED_SUCCESS":
      renderJsonFormatted(jsonViewer, payload);
      break;

    case "PLAN_VALIDATION_FAILED":
      renderJsonFormatted(jsonViewer, {
        error: "فشل التحقق من المخطط",
        details: payload,
      });
      break;

    case "PARCEL_SELECTED":
      renderJsonFormatted(validationViewer, payload);
      break;

    case "ERROR":
      renderJsonFormatted(planValidationViewer, {
        status: "ERROR",
        message: payload?.message,
      });
      break;
  }
});
