import { shapefileApi } from "./apiService.js";
import { processPlanValidation } from "./planProcessor.js";
import { initSpatialValidation } from "./spatialValidation.js";
import { calcStatistics, renderJson } from "./statistics.js";
import { setupLayerListWidget } from "./layerManager.js";
import { drawLayers } from "./drawLayers.js";
import { municipalityManager } from "./municipalityManager.js";
import {
  setLoadingState,
  setInvalidPlanState,
  setValidPlanState,
  setErrorState,
} from "./uiManager.js";
import { surveyDecisionManager } from "./surveyDecisionManager.js";

require([
  "esri/Map",
  "esri/views/MapView",
  "esri/layers/GeoJSONLayer",
  "esri/widgets/LayerList",
  "esri/widgets/Expand",
  "esri/geometry/geometryEngine",
  "esri/geometry/Polygon",
  "esri/geometry/projection",
  "esri/geometry/SpatialReference",
  "esri/Graphic",
  "esri/rest/support/Query",
  "esri/layers/FeatureLayer",
  "esri/geometry/Polyline",
  "esri/geometry/Point",
  "esri/layers/GraphicsLayer",
], function (
  Map,
  MapView,
  GeoJSONLayer,
  LayerList,
  Expand,
  geometryEngine,
  Polygon,
  projection,
  SpatialReference,
  Graphic,
  Query,
  FeatureLayer,
  Polyline,
  Point,
  GraphicsLayer,
) {
  initSpatialValidation(geometryEngine);
  const map = new Map({
    basemap: "satellite", //"hybrid"
  });
  const view = new MapView({
    container: "viewDiv",
    map,
    center: [44.3, 24.8],
    zoom: 6,
  });
  setupLayerListWidget(LayerList, Expand, view);

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
      let result;
      if (radioMuni.checked) {
        //^ Municipality path
        result = await municipalityManager(
          view,
          GraphicsLayer,
          Graphic,
          FeatureLayer,
          validationViewer,
        );
      } else {
        //^ Survey Decision path
        const krokino = inputKrokino.value.trim();
        if (!krokino) throw new Error("يرجى إدخال رقم القرار المساحي أولاً.");

        result = await surveyDecisionManager(
          krokino,
          view,
          GraphicsLayer,
          Graphic,
          FeatureLayer,
          geometryEngine,
          validationViewer,
          Polygon,
        );
      }

      activeContext = result.context;
      activeLayer = result.layer;
      if (activeContext) {
        uploadSectionDiv.classList.remove("disabled");
        fileInput.disabled = false;
      }
    } catch (err) {
      console.error(err);
      if (validationViewer) {
        validationViewer.innerHTML = `<span style="color:red;">خطأ: ${err.message}</span>`;
      }
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
        SpatialReference,
        projection,
        Polygon,
        Polyline,
        Point,
      );

      const {
        isValid,
        boundsCheck,
        zone,
        projectedArea,
        geoLayers,
      } = validationResult;

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
      await drawLayers(geoLayers, view, GeoJSONLayer);
    } catch (err) {
      console.error(err);
      setErrorState(validationViewer, jsonViewer, err.message);
    } finally {
      fileInput.value = "";
    }
  });
});
