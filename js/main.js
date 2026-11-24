import { loadEsriModules } from "./esriLibrary.js";
import * as business from "./business.js";
import * as templates from "./templates.js";

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

    templates.setupLayerListWidget(view);

    const fileInput = document.getElementById("shpFileInput");
    const statisticsPanel = document.getElementById("jsonViewer");
    const statusPanel = document.getElementById("validationViewer");
    const urbanAreaPanel = document.getElementById("urbanAreaViewer");
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
    let activeUrbanLayer = null;

    let currentCombinedReport = null;
    let currentReprojectedLayers = null;
    let currentStreetFeatures = [];

    fetchContextBtn.addEventListener("click", async () => {
      if (activeLayer) view.map.layers.remove(activeLayer);
      if (activeUrbanLayer) view.map.layers.remove(activeUrbanLayer);
      activeContext = null;
      activeLayer = null;
      activeUrbanLayer = null;
      urbanAreaPanel.style.display = "none";

      uploadSectionDiv.classList.add("disabled");
      fileInput.disabled = true;
      fileInput.value = "";

      try {
        let result;
        if (radioMuni.checked) {
          statusPanel.textContent =
            "جاري الاتصال بالسيرفر لجلب نطاق البلدية...";

          //^ Municipality
          result = await business.getMunicipality(business.MUNICIPALITY_CODE);
        } else {
          const krokino = inputKrokino.value.trim();

          if (!krokino) throw new Error("يرجى إدخال رقم القرار المساحي اولا");
          statusPanel.textContent =
            "جاري الاتصال بالسيرفر لجلب القرار المساحي واستنتاج الزون...";

          //^ Survey Decision
          result = await business.getSurveyDecision(krokino);
        }

        activeContext = result;

        if (activeContext) {
          //^ Draw Context polygon
          activeLayer = await business.drawContextPolygon(view, activeContext);
          //^ Draw Urban Area polygon
          activeUrbanLayer = await business.drawUrbanAreaPolygon(
            view,
            activeContext.urbanAreaInfo,
          );

          uploadSectionDiv.classList.remove("disabled");
          fileInput.disabled = false;
          const zoneMsg = activeContext.zone
            ? ` - النطاق: <b>Zone ${activeContext.zone.number}</b>`
            : "";

          //^ render Urban Area Info
          templates.renderUrbanAreaInfo(
            activeContext.urbanAreaInfo,
            urbanAreaPanel,
          );

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
        if (layer !== activeLayer && layer !== activeUrbanLayer)
          layersToRemove.push(layer);
      });
      view.map.removeMany(layersToRemove);

      try {
        if (!activeContext)
          throw new Error(
            "بيانات النطاق غير متاحة للمطابقة. يرجى جلب النطاق الأساسي",
          );
        //^ read the shapefileApi
        const rawLayers = await templates.parseShapefile(file);
        //^ process the processPlanValidation
        const validationResult = await business.processPlan(
          rawLayers,
          activeContext,
        );

        const {
          isValid,
          designValidationError,
          designWarnings,
          boundsCheck,
          zone,
          projectedArea,
          reprojectedLayers,
          statistics,
          ideaValidation,
          planValidation,
          rawStreetFeatures,
        } = validationResult;

        if (!isValid) {
          const targetName =
            activeContext.type === "decision" ? "القرار المساحي" : "البلدية";

          if (designValidationError) {
            const errDetails = designValidationError;
            statusPanel.innerHTML = `
              <div dir="rtl" style="text-align: right; color: red; font-weight: bold; padding: 6px; border: 1px solid red; border-radius: 4px; background: #fff0f0;">
                <div style="font-size: 15px; margin-bottom: 6px;">تم إيقاف المخطط لعدم استيفاء الشروط الوصفية:</div>
                <div style="font-size: 13px; color: #333;"><strong>السبب:</strong> ${errDetails.error}</div>
                <div style="font-size: 13px; color: #333;"><strong>الطبقة:</strong> <code>${errDetails.layerName}</code></div>
                <div style="font-size: 13px; color: #333;"><strong>اسم الحقل:</strong> <code>${errDetails.fieldName}</code></div>
              </div>
            `;
          } else {
            statusPanel.innerHTML = `
              <div style="margin-bottom: 8px; color:red; font-weight:bold;">${boundsCheck.message}</div>
              <div style="color: gray;">تم إيقاف عملية الرسم والمعالجة لأن المخطط يقع خارج نطاق ${targetName} المعتمد.</div>
            `;
          }

          statisticsPanel.textContent =
            "تم إلغاء عرض البيانات (المخطط غير صالح).";
          fileInput.value = "";
          return;
        }

        //* render status panel with warnings
        let warningsHtml = "";
        if (designWarnings && designWarnings.length > 0) {
          const warningsList = designWarnings
            .map((w) => `<li>${w.message}</li>`)
            .join("");
          warningsHtml = `
            <div dir="rtl" style="margin-top: 8px; padding: 10px 12px; background-color: #fffbe6; border: 1px solid #ffe58f; border-radius: 4px; color: #d46b08; font-size: 13px; text-align: right;">
             <strong>تنبيهات:</strong>
             <ul style="margin: 6px 0 0 0; padding-right: 20px;">${warningsList}</ul>
            </div>
          `;
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
            ${warningsHtml}
          </div>
        `;

        //^ Render Report (statistics + ideaValidation)
        const combinedReport = {
          planValidation: planValidation,
          ideaValidation: ideaValidation,
          statistics: statistics,
        };

        currentStreetFeatures = rawStreetFeatures || [];
        currentCombinedReport = combinedReport;
        currentReprojectedLayers = reprojectedLayers;

        templates.renderStatistics(currentCombinedReport, statisticsPanel);

        // ^ draw layers on the map
        if (reprojectedLayers && reprojectedLayers.length > 0) {
          await templates.drawLayers(reprojectedLayers, view);
        }
        //^ get all parcel labels and draw them on the map
        const allParcelLabels = business.processAllParcels(reprojectedLayers);
        templates.drawAllParcelLineLabels(view, allParcelLabels);

        //* draw warnings polygons on the map
        if (designWarnings && designWarnings.length > 0) {
          await business.drawDesignWarnings(view, designWarnings);
        }
      } catch (err) {
        console.error(err);
        statisticsPanel.textContent = "خطأ أثناء المعالجة: " + err.message;
        statusPanel.innerHTML = `<span style="color:red">حدث خطأ: ${err.message}</span>`;
      } finally {
        fileInput.value = "";
      }
    });

    //* step 3 --> Map click event for parcel selection
    view.on("click", async (event) => {
      //^ get parcel details
      const parcel = await business.getParcelDetails(
        event.mapPoint,
        currentReprojectedLayers,
        currentStreetFeatures,
      );
      if (!parcel) return;

      //^ highlight parcel
      templates.highlightParcel(view, parcel.geometry);

      //^ render parcel viewer
      templates.renderParcelViewer(
        parcel.attributes,
        currentCombinedReport,
        statisticsPanel,
      );
    });
  } catch (error) {
    console.error("فشل في تهيئة مكتبات Esri", error);
  }
}

initializeApp();
