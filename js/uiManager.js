export function setLoadingState(jsonViewer, validationViewer) {
  jsonViewer.textContent = "جاري رفع ومعالجة الملف على السيرفر...";
  validationViewer.textContent = "جاري الفحص المكاني...";
}

export function setInvalidPlanState(validationViewer, jsonViewer, message) {
  validationViewer.innerHTML = `
    <div style="margin-bottom: 8px; color:red; font-weight:bold;">${message}</div>
    <div style="color: gray;">تم إيقاف عملية الرسم والمعالجة لأن المخطط يقع خارج نطاق البلدية المعتمد.</div>
  `;
  jsonViewer.textContent = "تم إلغاء عرض البيانات (المخطط خارج النطاق).";
}

export function setValidPlanState(
  validationViewer,
  boundsMessage,
  zone,
  projectedArea,
) {
  validationViewer.innerHTML = `
    <div dir="rtl" style="text-align: right; display: flex; flex-direction: column; gap: 8px;">
      <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px;">
        <strong>حالة المخطط:</strong> 
        <span style="color:green;">${boundsMessage}</span>
      </div>
      <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px;">
        <strong>نطاق <span dir="ltr" style="display:inline-block;">UTM</span> المستنتج:</strong> 
        <span style="color:blue;" dir="ltr">Zone ${zone.number} (WKID: ${zone.wkid})</span>
      </div>
      <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px;">
        <strong>مساحة القرار هندسياً (م²):</strong> 
        <span style="color:green; font-weight:bold; font-size:15px;" dir="ltr">
          ${projectedArea.toLocaleString("en-US", { maximumFractionDigits: 2 })}
        </span>
      </div>

    </div>
  `;
}

export function setErrorState(validationViewer, jsonViewer, errorMessage) {
  jsonViewer.textContent = "خطأ أثناء المعالجة: " + errorMessage;
  validationViewer.innerHTML = `<span style="color:red">حدث خطأ: ${errorMessage}</span>`;
}
