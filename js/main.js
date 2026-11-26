import { loadEsriModules } from "./esriLibrary.js";
import * as business from "./business.js";
import * as templates from "./templates.js";

let view = null;
let activeContext = null;
let activeLayer = null;
let activeUrbanLayer = null;
let currentCombinedReport = null;
let currentReprojectedLayers = null;
let currentStreetFeatures = [];

//^ postMessage
function notifyParent(action, payload) {
  console.log(`[Sending POSTMESSAGE] ${action}]:`, payload);

  window.parent.postMessage(
    {
      source: "GIS",
      action: action,
      payload: payload,
    },
    "*",
  );
}

//^ fetchContextBtn (جلب ورسم) بديل
export async function loadContext(type, code) {
  if (!view) return;

  view.map.removeAll();
  templates.highlightParcel(view, null);
  templates.drawAllParcelLineLabels(view, []);

  activeContext = null;
  activeLayer = null;
  activeUrbanLayer = null;
  currentCombinedReport = null;
  currentReprojectedLayers = null;
  currentStreetFeatures = [];

  notifyParent("LOADING_STARTED", { type, code });

  try {
    let result;
    if (type === "municipality") {
      //^ Municipality
      result = await business.getMunicipality(
        code || business.MUNICIPALITY_CODE,
      );
    } else {
      //^ Survey Decision
      result = await business.getSurveyDecision(code);
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

      const reportToRender =
        activeContext.muniReport || activeContext.decisionReport;

      //* renderPlanValidation         بديل
      notifyParent("CONTEXT_LOADED", {
        type: activeContext.type,
        code: activeContext.code,
        name: activeContext.name,
        landArea: activeContext.landArea,
        zone: activeContext.zone,
        urbanAreaInfo: activeContext.urbanAreaInfo,
        attributes: activeContext.attributes,
        report: reportToRender,
      });
    }
  } catch (err) {
    console.error(err);
    notifyParent("ERROR", { message: err.message });
  }
}

async function initializeApp() {
  try {
    const esri = await loadEsriModules();

    const map = new esri.Map({
      basemap: "satellite",
    });

    view = new esri.MapView({
      container: "viewDiv",
      map,
      center: [44.3, 24.8],
      zoom: 6,
    });

    templates.setupLayerListWidget(view);

    //* //^ step 1 --> chk URL parameters load (decision or municipality)
    checkUrlParameters();

    //* step  --> setup incoming messages from parent
    setupIncomingParentMessages();

    //* step 2 --> process the uploaded shapefile
    const fileInput = document.getElementById("shpFileInput");
    if (fileInput) {
      fileInput.addEventListener("change", async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        if (!activeContext) {
          notifyParent("ERROR", {
            message: "يرجى جلب النطاق الأساسي أولاً قبل رفع المخطط.",
          });
          fileInput.value = "";
          return;
        }

        const isContextLayer = (layer) => {
          if (!activeLayer) return false;
          return Array.isArray(activeLayer)
            ? activeLayer.includes(layer)
            : layer === activeLayer;
        };

        const layersToRemove = [];
        view.map.layers.forEach((layer) => {
          if (!isContextLayer(layer) && layer !== activeUrbanLayer)
            layersToRemove.push(layer);
        });
        view.map.removeMany(layersToRemove);

        try {
          notifyParent("PLAN_PROCESSING_STARTED", { fileName: file.name });

          //^ read the shapefileApi
          const rawLayers = await templates.parseShapefile(file);
          //^ process Plan
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
            rawStreetFeatures,
          } = validationResult;

          if (!isValid) {
            notifyParent("PLAN_VALIDATION_FAILED", {
              isValid: false,
              boundsCheck,
              errorDetails: designValidationError || null,
            });
            fileInput.value = "";
            return;
          }

          const combinedReport = {
            ideaValidation: ideaValidation,
            statistics: statistics,
          };

          currentStreetFeatures = rawStreetFeatures || [];
          currentCombinedReport = combinedReport;
          currentReprojectedLayers = reprojectedLayers;

          //* renderStatistics بديل
          notifyParent("PLAN_PROCESSED_SUCCESS", {
            isValid: true,
            boundsCheck,
            zone,
            projectedArea,
            statistics,
            ideaValidation,
            designWarnings: designWarnings?.map((w) => w.message) || [],
          });

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
          notifyParent("ERROR", {
            message: "خطأ أثناء المعالجة: " + err.message,
          });
        } finally {
          fileInput.value = "";
        }
      });
    }

    //* step 3 --> Map click event for parcel selection
    view.on("click", async (event) => {
      const parcel = await business.getParcelDetails(
        event.mapPoint,
        currentReprojectedLayers,
        currentStreetFeatures,
      );
      if (!parcel) return;

      //^ highlight parcel
      templates.highlightParcel(view, parcel.geometry);

      //* renderParcelViewer بديل
      notifyParent("PARCEL_SELECTED", {
        attributes: parcel.attributes,
      });
    });
  } catch (error) {
    console.error("فشل في تهيئة مكتبات Esri", error);
  }
}

function checkUrlParameters() {
  const urlParams = new URLSearchParams(window.location.search);
  const krokino = urlParams.get("krokino");
  const muniCode = urlParams.get("muniCode");

  if (krokino) {
    loadContext("decision", krokino);
  } else if (muniCode) {
    loadContext("municipality", muniCode);
  }
}

function setupIncomingParentMessages() {
  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || data.target !== "GIS") return;

    if (data.command === "LOAD_DECISION") {
      loadContext("decision", data.code);
    } else if (data.command === "LOAD_MUNICIPALITY") {
      loadContext("municipality", data.code);
    } else if (data.command === "CLEAR_MAP") {
      if (view) view.map.removeAll();
    }
  });
}

initializeApp();
