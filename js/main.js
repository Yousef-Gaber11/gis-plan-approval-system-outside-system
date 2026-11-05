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
  const map = new Map({ basemap: "satellite" });
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

  //* first step
  let municipalityContext = null;
  let muniLayer = null;
  const muniReady = municipalityManager(
    view,
    GraphicsLayer,
    Graphic,
    FeatureLayer,
    validationViewer,
  ).then((result) => {
    municipalityContext = result.context;
    muniLayer = result.layer;
  });

  //* second step
  fileInput.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setLoadingState(jsonViewer, validationViewer);

    view.map.layers.forEach((layer) => {
      if (layer !== muniLayer) view.map.layers.remove(layer);
    });

    try {
      await muniReady;
      if (!municipalityContext)
        throw new Error(
          "بيانات البلدية غير متاحة للمطابقة. يرجى تحديث الصفحة.",
        );

      const rawLayers = await shapefileApi(file);

      const validationResult = await processPlanValidation(
        rawLayers,
        municipalityContext,
        SpatialReference,
        projection,
        Polygon,
        Polyline,
        Point,
      );

      const { isValid, boundsCheck, zone, projectedArea, geoLayers } =
        validationResult;

      if (!isValid) {
        setInvalidPlanState(validationViewer, jsonViewer, boundsCheck.message);
        fileInput.value = "";
        return;
      }

      setValidPlanState(
        validationViewer,
        boundsCheck.message,
        zone,
        projectedArea,
      );

      //^ statistics
      const statistics = calcStatistics(geoLayers);
      renderJson(statistics, jsonViewer);
      //^ draw
      await drawLayers(geoLayers, view, GeoJSONLayer);
    } catch (err) {
      console.error(err);
      setErrorState(validationViewer, jsonViewer, err.message);
    } finally {
      fileInput.value = "";
    }
  });
});
