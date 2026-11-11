import { loadEsriModules } from "./esriLibrary.js";
import { shapefileApi } from "./apiService.js";
import { processPlanValidation } from "./planProcessor.js";
import { calcStatistics, renderJson } from "./statistics.js";
import { setupLayerListWidget } from "./layerManager.js";
import { drawLayers } from "./drawLayers.js";
import {
  setLoadingState,
  setInvalidPlanState,
  setValidPlanState,
  setErrorState,
} from "./uiManager.js";

import {
  fetchMunicipalityData,
  fetchSurveyDecisionData,
  MUNICIPALITY_CODE,
} from "./businessQueries.js";
import { executeIntersectQuery } from "./queryTemplates.js";
import { buildLocalLayer } from "./layerBuilder.js";
import { zonesFeatureCollection } from "./zonesData.js";
import { formatZoneOutput, calculateMaxIntersectingArea } from "./helperFun.js";
import { drawContextPolygon } from "./graphicRenderer.js";

async function initializeApp() {
  try {
    const esri = await loadEsriModules();

    const map = new esri.Map({
      basemap: "satellite", //"hybrid"
    });
    const view = new esri.MapView({
      container: "viewDiv",
      map,
      center: [44.3, 24.8],
      zoom: 6,
    });

    setupLayerListWidget(view);

    const fileInput = document.getElementById("shpFileInput");
    const jsonViewer = document.getElementById("jsonViewer");
    const validationViewer = document.getElementById("validationViewer");
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

    //* step 1 --> fetch the context (municipality or survey decision)
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
        if (radioMuni.checked) {
          validationViewer.textContent =
            "جاري الاتصال بالسيرفر لجلب نطاق البلدية...";

          //* 1. fetch Municipality Data
          const feature = await fetchMunicipalityData(MUNICIPALITY_CODE);
          const attrs = feature.attributes;

          //* 2. Format Zone
          const zone = formatZoneOutput(
            attrs.ZONE ? parseInt(attrs.ZONE, 10) : null,
          );
          activeContext = {
            type: "municipality",
            code: MUNICIPALITY_CODE,
            name:
              (attrs.MUNICIPALITYARNAME || "") +
              (attrs.AMANA ? " - " + attrs.AMANA : ""),
            polygon: feature.geometry,
            zone: zone,
            attributes: attrs,
          };

          //* 3. draw Municipality Polygon
          activeLayer = await drawContextPolygon(
            view,
            activeContext.polygon,
            "municipality",
            "حدود البلدية",
          );
        } else {
          const krokino = inputKrokino.value.trim();
          if (!krokino) throw new Error("يرجى إدخال رقم القرار المساحي اولا");

          validationViewer.textContent =
            "جاري الاتصال بالسيرفر لجلب القرار المساحي واستنتاج الزون...";

          //* 1. fetch Survey Decision Data
          const feature = await fetchSurveyDecisionData(krokino);
          const decisionPolygon = feature.geometry;
          const attrs = feature.attributes;

          const fieldsDef = [
            { name: "OBJECTID", type: "oid" },
            { name: "ZONE", type: "integer" },
          ];
          //* 2. build Local Zone Layer
          const localZoneLayer = buildLocalLayer(
            zonesFeatureCollection,
            fieldsDef,
          );
          //* 3. Query Intersecting Zones
          const intersectingZones = await executeIntersectQuery(
            decisionPolygon,
            localZoneLayer,
            ["ZONE"],
          );

          //* 4. Calculate Max Intersecting Area
          const bestZoneRaw = calculateMaxIntersectingArea(
            intersectingZones,
            decisionPolygon,
            "ZONE",
          );
          //* 5. Format Zone Output
          const finalZone = formatZoneOutput(bestZoneRaw);

          if (!finalZone) {
            throw new Error(
              "تعذر استنتاج الزون، القرار المساحي قد يقع خارج النطاقات المعتمدة.",
            );
          }

          activeContext = {
            type: "decision",
            code: krokino,
            name: `القرار المساحي: ${krokino}`,
            landArea: attrs.LANDAREA || 0,
            polygon: decisionPolygon,
            zone: finalZone,
            attributes: attrs,
          };

          //* 6. draw Survey Decision Polygon
          activeLayer = await drawContextPolygon(
            view,
            activeContext.polygon,
            "decision",
            "حدود القرار المساحي",
          );
        }

        if (activeContext) {
          uploadSectionDiv.classList.remove("disabled");
          fileInput.disabled = false;

          const zoneMsg = activeContext.zone
            ? ` - النطاق: <b>Zone ${activeContext.zone.number}</b>`
            : "";
          validationViewer.innerHTML = `<span style="color:green;">تم تحميل (${activeContext.name})${zoneMsg} - في انتظار رفع المخطط...</span>`;
        }
      } catch (err) {
        console.error(err);
        validationViewer.innerHTML = `<span style="color:red;">خطأ: ${err.message}</span>`;
      }
    });

    //* step 2 --> process the uploaded shapefile
    fileInput.addEventListener("change", async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      setLoadingState(jsonViewer, validationViewer);
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
        const rawLayers = await shapefileApi(file);
        //^ process the processPlanValidation
        const validationResult = await processPlanValidation(
          rawLayers,
          activeContext,
        );

        const { isValid, boundsCheck, zone, projectedArea, geoLayers } =
          validationResult;

        if (!isValid) {
          setInvalidPlanState(
            validationViewer,
            jsonViewer,
            boundsCheck.message,
            activeContext.type,
          );
          fileInput.value = "";
          return;
        }

        setValidPlanState(
          validationViewer,
          boundsCheck.message,
          zone,
          projectedArea,
        );

        // ^ calculate statistics
        const statistics = calcStatistics(geoLayers, projectedArea);
        renderJson(statistics, jsonViewer);
        // ^ draw
        await drawLayers(geoLayers, view);
      } catch (err) {
        console.error(err);
        setErrorState(validationViewer, jsonViewer, err.message);
      } finally {
        fileInput.value = "";
      }
    });
  } catch (error) {
    console.error("فشل في تهيئة مكتبات Esri", error);
  }
}

initializeApp();