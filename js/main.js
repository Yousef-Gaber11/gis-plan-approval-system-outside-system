import { setupLayerListWidget } from "./layerManager.js";
import { layersDictionary, LAND_USE } from "./layersConfig.js";

//* ===== Helper Funs =====
const getLandUseName = (code) =>
  LAND_USE[String(code)]?.name ?? "unknown_" + code;

const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n) => Math.round(n * 100) / 100;

function findLayer(layers, name) {
  return layers.find(
    (l) =>
      (l.fileName || "").split("/").pop().toLowerCase() === name.toLowerCase(),
  );
}

require([
  "esri/Map",
  "esri/views/MapView",
  "esri/layers/GeoJSONLayer",
  "esri/widgets/LayerList",
  "esri/widgets/Expand",
], function (Map, MapView, GeoJSONLayer, LayerList, Expand) {
  const map = new Map({
    basemap: "satellite",
    // basemap: "hybrid",
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

  fileInput.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    jsonViewer.textContent = "Reading file...";
    let layers;

    try {
      const buffer = await file.arrayBuffer();
      const result = await shp(buffer);
      layers = Array.isArray(result) ? result : [result];
    } catch (err) {
      console.error(err);
      jsonViewer.textContent = "Could not read the shapefile (.zip).";
      fileInput.value = "";
      return;
    }

    try {
      const statistics = calcStatistics(layers);
      renderJson(statistics);
      drawMap(layers);
    } catch (err) {
      console.error(err);
      jsonViewer.textContent =
        "Error while processing the data: " + err.message;
    } finally {
      fileInput.value = "";
    }
  });

  //* ===== Statistics =====
  function calcStatistics(layers) {
    const survey = findLayer(layers, "SurveyS");
    const parcels = findLayer(layers, "ParcelsPolygonS");
    const streets = findLayer(layers, "PlansStreetsPlygonsS");
    const parking = findLayer(layers, "PlansCarParkingS");
    const lakes = findLayer(layers, "PlansLakesS");

    const statistics = {
      planArea: toNum(survey?.features?.[0]?.properties?.Area),
      landuseInfo: {},
      parcelsListInfo: [],
      PlansStreetsPlygonsS: { area: 0, areaPercentage: 0 },
      PlansCarParkingS: { area: 0, areaPercentage: 0 },
      PlansLakesS: { area: 0, areaPercentage: 0 },
    };

    for (const feature of parcels?.features ?? []) {
      const p = feature.properties;
      const name = getLandUseName(p.USECODE ?? "");
      const area = toNum(p.Area);

      statistics.parcelsListInfo.push({
        parcelNo: String(p.PARCELNO ?? "N/A"),
        area,
        landUse: name,
      });

      const info = (statistics.landuseInfo[name] ??= {
        landuse: name,
        count: 0,
        area: 0,
        areaPercentage: 0,
      });
      info.count += 1;
      info.area += area;
    }

    const sumArea = (layer) =>
      (layer?.features ?? []).reduce((s, f) => s + toNum(f.properties.Area), 0);

    statistics.PlansStreetsPlygonsS.area = sumArea(streets);
    statistics.PlansCarParkingS.area = sumArea(parking);
    statistics.PlansLakesS.area = sumArea(lakes);

    const pct = (a) =>
      statistics.planArea > 0 ? round2((a / statistics.planArea) * 100) : 0;

    for (const info of Object.values(statistics.landuseInfo)) {
      info.area = round2(info.area);
      info.areaPercentage = pct(info.area);
    }
    for (const k of [
      "PlansStreetsPlygonsS",
      "PlansCarParkingS",
      "PlansLakesS",
    ]) {
      statistics[k].area = round2(statistics[k].area);
      statistics[k].areaPercentage = pct(statistics[k].area);
    }
    return statistics;
  }

  //* ===== JSON viewer =====
  function renderJson(statistics) {
    jsonViewer.innerHTML = "";
    jsonViewer.classList.remove("waiting");
    const formatter = new JSONFormatter({ statistics }, 3, {
      hoverPreviewEnabled: false,
      theme: "light",
    });
    jsonViewer.appendChild(formatter.render());
  }

  //* ===== Map draw =====
  function createMapLayer(geoJson, renderer, labelClass, title) {
    const blob = new Blob([JSON.stringify(geoJson)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const layer = new GeoJSONLayer({
      url,
      renderer,
      title: title,
      labelingInfo: labelClass ? [labelClass] : [],
    });
    const release = () => URL.revokeObjectURL(url);
    layer.when(release, release);
    return layer;
  }

  function drawMap(layers) {
    map.removeAll();

    layers.forEach((layerData) => {
      const layerName = (layerData.fileName || "")
        .split("/")
        .pop()
        .toLowerCase();

      const config = layersDictionary[layerName];

      if (config) {
        const mapLayer = createMapLayer(
          layerData,
          config.renderer,
          config.labelClass || null,
          config.title,
        );
        map.add(mapLayer);

        if (layerName === "parcelspolygons") {
          mapLayer.when(() => view.goTo(mapLayer.fullExtent));
        }
      } else {
        console.warn(`الطبقة ${layerName} ليس لها إعدادات في الكتالوج.`);
      }
    });
  }
});
