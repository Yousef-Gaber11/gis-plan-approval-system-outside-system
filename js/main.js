import { loadEsriModules } from "./esriLibrary.js";
import {
  getMunicipality,
  getSurveyDecision,
  processPlan,
  MUNICIPALITY_CODE,
} from "./business.js";
import {
  setupLayerListWidget,
  parseShapefile,
  calcStatistics,
  renderStatistics,
  drawLayers,
} from "./templates.js";

async function initializeApp() {
  try {
    const esri = await loadEsriModules();

    const map = new esri.Map({
      basemap: "satellite",
    });
    const view = new esri.MapView({
      container: "viewDiv",
      map,
      center: [44.3, 24.8],
      zoom: 6,
    });

    setupLayerListWidget(view);

    const fileInput = document.getElementById("shpFileInput");
    const statisticsPanel = document.getElementById("jsonViewer");
    const statusPanel = document.getElementById("validationViewer");
    const uploadSectionDiv = document.getElementById("uploadSectionDiv");
    const radioMuni = document.getElementById("radioMuni");
    const radioDecision = document.getElementById("radioDecision");
    const inputMuniCode = document.getElementById("inputMuniCode");
    const inputKrokino = document.getElementById("inputKrokino");
    const fetchContextBtn = document.getElementById("fetchContextBtn");

    radioMuni.addEventListener("change", () => {
      inputMuniCode.style.display = "block";
      inputKrokino.style.display = "none";
    });
    radioDecision.addEventListener("change", () => {
      inputMuniCode.style.display = "none";
      inputKrokino.style.display = "block";
    });

    //* step 1 --> fetch (municipality or survey decision)
    let activeContext = null;
    let activeLayer = null;

    fetchContextBtn.addEventListener("click", async () => {
      if (activeLayer) view.map.layers.remove(activeLayer);
      activeContext = null;
      activeLayer = null;

      uploadSectionDiv.classList.add("disabled");
      fileInput.disabled = true;
      fileInput.value = "";

      try {
        let result;
        if (radioMuni.checked) {
          statusPanel.textContent =
            "جاري الاتصال بالسيرفر لجلب نطاق البلدية...";

          //^ Municipality
          result = await getMunicipality(view, MUNICIPALITY_CODE);
        } else {
          const krokino = inputKrokino.value.trim();

          if (!krokino) throw new Error("يرجى إدخال رقم القرار المساحي اولا");
          statusPanel.textContent =
            "جاري الاتصال بالسيرفر لجلب القرار المساحي واستنتاج الزون...";

          //^ Survey Decision
          result = await getSurveyDecision(view, krokino);
        }

        activeContext = result.context;
        activeLayer = result.layer;

        if (activeContext) {
          uploadSectionDiv.classList.remove("disabled");
          fileInput.disabled = false;
          const zoneMsg = activeContext.zone
            ? ` - النطاق: <b>Zone ${activeContext.zone.number}</b>`
            : "";
          statusPanel.innerHTML = `<span style="color:green;">تم تحميل (${activeContext.name})${zoneMsg} - في انتظار رفع المخطط...</span>`;
        }
      } catch (err) {
        console.error(err);
        statusPanel.innerHTML = `<span style="color:red;">خطأ: ${err.message}</span>`;
      }
    });

    //* step 2 --> process the uploaded shapefile
    fileInput.addEventListener("change", async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      statisticsPanel.textContent = "جاري رفع ومعالجة الملف على السيرفر...";
      statusPanel.textContent = "جاري الفحص المكاني...";
      const layersToRemove = [];
      view.map.layers.forEach((layer) => {
        if (layer !== activeLayer) layersToRemove.push(layer);
      });
      view.map.removeMany(layersToRemove);

      try {
        if (!activeContext)
          throw new Error(
            "بيانات النطاق غير متاحة للمطابقة. يرجى جلب النطاق الأساسي",
          );
        //^ read the shapefileApi
        const rawLayers = await parseShapefile(file);
        //^ process the processPlanValidation
        const validationResult = await processPlan(rawLayers, activeContext);

        const {
          isValid,
          boundsCheck,
          zone,
          projectedArea,
          reprojectedLayers,
          statistics,
        } = validationResult;

        if (!isValid) {
          const targetName =
            activeContext.type === "decision" ? "القرار المساحي" : "البلدية";
          statusPanel.innerHTML = `
            <div style="margin-bottom: 8px; color:red; font-weight:bold;">${boundsCheck.message}</div>
            <div style="color: gray;">تم إيقاف عملية الرسم والمعالجة لأن المخطط يقع خارج نطاق ${targetName} المعتمد.</div>
          `;
          statisticsPanel.textContent =
            "تم إلغاء عرض البيانات (المخطط خارج النطاق).";
          fileInput.value = "";
          return;
        }
        statusPanel.innerHTML = `
          <div dir="rtl" style="text-align: right; display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px;">
              <strong>حالة المخطط:</strong> 
              <span style="color:green;">${boundsCheck.message}</span>
            </div>
            <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px;">
              <strong>نطاق <span dir="ltr" style="display:inline-block;">UTM</span> المستنتج:</strong> 
              <span style="color:blue;" dir="ltr">Zone ${zone.number} (WKID: ${zone.wkid})</span>
            </div>
            <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px;">
              <strong>مساحة النطاق هندسياً (م²):</strong> 
              <span style="color:green; font-weight:bold; font-size:15px;" dir="ltr">
                ${projectedArea.toLocaleString("en-US", { maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        `;

        //^ show statistics in the statistics panel
        renderStatistics(statistics, statisticsPanel);
        // ^ draw layers on the map
        if (reprojectedLayers && reprojectedLayers.length > 0) {
          await drawLayers(reprojectedLayers, view);
        }
      } catch (err) {
        console.error(err);
        statisticsPanel.textContent = "خطأ أثناء المعالجة: " + err.message;
        statusPanel.innerHTML = `<span style="color:red">حدث خطأ: ${err.message}</span>`;
      } finally {
        fileInput.value = "";
      }
    });
  } catch (error) {
    console.error("فشل في تهيئة مكتبات Esri", error);
  }
}

initializeApp();
