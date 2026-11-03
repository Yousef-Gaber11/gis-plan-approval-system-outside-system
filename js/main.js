import { setupLayerListWidget } from "./layerManager.js";
import { layersDictionary, LAND_USE } from "./layersConfig.js";

import {
  initSpatialValidation,
  detectMunicipalityZone,
  checkMunicipalityBoundary,
  calculateProjectedArea,
} from "./spatialValidation.js";

//* ===== Helper Funs =====
const getLandUseName = (code) => {
  const use = LAND_USE[String(code)];
  if (use) {
    return `${use.nameAr} / ${use.nameEn}`;
  }
  return "غير معرف / unknown_" + code;
};

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
  "esri/geometry/geometryEngine",
  "esri/geometry/Polygon",
  "esri/geometry/projection",
  "esri/geometry/SpatialReference",
  "esri/Graphic",
  "esri/rest/support/Query",
  "esri/layers/FeatureLayer",
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
) {
  initSpatialValidation(
    geometryEngine,
    Polygon,
    projection,
    SpatialReference,
    Query,
    FeatureLayer,
    Graphic,
  );

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

    jsonViewer.textContent = "جاري رفع ومعالجة الملف على السيرفر...";
    let layers;

    //* shpjs
    // try {
    //   const buffer = await file.arrayBuffer();
    //   const result = await shp(buffer);
    //   layers = Array.isArray(result) ? result : [result];
    // } catch (err) {
    //   console.error(err);
    //   jsonViewer.textContent = "Could not read the shapefile (.zip).";
    //   fileInput.value = "";
    //   return;
    // }

    try {
      const formData = new FormData();
      formData.append("file", file);

      const apiUrl = "https://localhost:7232/api/shapefile/parse";
      const response = await fetch(apiUrl, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`خطأ من السيرفر: ${response.statusText}`);
      }

      // Get GeoJSON data from the response
      const result = await response.json();

      layers = Array.isArray(result) ? result : [result];
    } catch (err) {
      console.error(err);
      jsonViewer.textContent = "فشل في قراءة أو معالجة الملف من السيرفر.";
      fileInput.value = "";
      return;
    }

    try {
      const statistics = calcStatistics(layers);
      renderJson(statistics);
      drawMap(layers);

      performSpatialValidation(layers, view);
    } catch (err) {
      console.error(err);
      jsonViewer.textContent = "خطأ أثناء عرض البيانات: " + err.message;
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
      const code = p.USECODE ?? "";
      const info = (statistics.landuseInfo[name] ??= {
        landuse: code, //name,
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

  async function drawMap(layers) {
    map.removeAll();

    let overallExtent = null;

    for (const layerData of layers) {
      const layerName = (layerData.fileName || "")
        .split("/")
        .pop()
        .toLowerCase();

      const config = layersDictionary[layerName];

      if (!config) {
        console.warn(`الطبقة ${layerName} ليس لها إعدادات في الكتالوج.`);
        continue;
      }

      const hasGeometry = (layerData.features || []).some(
        (f) => f.geometry !== null,
      );

      if (!hasGeometry) {
        console.warn(
          `تم تخطي الطبقة ${layerName} لأنها لا تحتوي على بيانات هندسية`,
        );
        continue;
      }

      const mapLayer = createMapLayer(
        layerData,
        config.renderer,
        config.labelClass || null,
        config.title,
      );
      map.add(mapLayer);

      try {
        await mapLayer.when();
        const ext = mapLayer.fullExtent;
        if (ext) {
          overallExtent = overallExtent
            ? overallExtent.union(ext)
            : ext.clone();
        }
      } catch (err) {
        console.warn(`فشل حساب نطاق الطبقة ${layerName}`, err);
      }
    }

    if (overallExtent) {
      try {
        await view.when();
        await view.goTo(overallExtent.expand(1.2), {
          animate: true,
          duration: 1000,
          easing: "ease-in-out",
        });
      } catch (err) {
        console.error("خطأ أثناء تحريك الزووم", err);
      }
    } else {
      console.warn("لم يتم العثور على نطاق جغرافي للزووم");
    }
  }

  //* ===== Spatial Validation =====
  async function performSpatialValidation(layers, view) {
    const viewer = document.getElementById("validationViewer");

    const surveyLayer = findLayer(layers, "SurveyS");

    if (
      !surveyLayer ||
      !surveyLayer.features ||
      surveyLayer.features.length === 0 ||
      !surveyLayer.features[0].geometry
    ) {
      viewer.innerHTML =
        "<span style='color:red;'>لم يتم العثور على طبقة SurveyS أو بياناتها الهندسية في الملف المرفوع</span>";
      return;
    }

    try {
      viewer.innerHTML = "جاري التحليل المكاني وإسقاط الإحداثيات";

      const geojsonGeom = surveyLayer.features[0].geometry;
      let rings = geojsonGeom.coordinates;
      if (!rings || rings.length === 0) {
        throw new Error("إحداثيات المخطط (SurveyS) غير صالحة.");
      }

      const surveyPoly = new Polygon({
        rings: rings,
        spatialReference: { wkid: 4326 },
      });

      // ^ check boundray
      const boundsCheck = checkMunicipalityBoundary(surveyPoly);

      // ^ detect Zone
      const muniZone = await detectMunicipalityZone(boundsCheck.polygon);
      const zone = muniZone;

      //^ calc AREA
      let projectedArea = 0;
      if (zone && zone.wkid) {
        let area = await calculateProjectedArea(surveyPoly, zone.wkid);
        projectedArea = Math.abs(area);
      }

      // * draw municipality
      if (boundsCheck && boundsCheck.polygon) {
        const muniGraphic = new Graphic({
          geometry: boundsCheck.polygon,
          symbol: {
            type: "simple-fill",
            color: [255, 165, 0, 0.1],
            outline: {
              color: [255, 69, 0, 1],
              width: 3,
              style: "long-dash-dot",
            },
          },
          attributes: { Name: "حدود البلدية" },
        });

        view.graphics.removeAll();
        view.graphics.add(muniGraphic);
      }

      //* UI Update
      viewer.innerHTML = `
        <div style="margin-bottom: 8px;">
          <strong>حالة المخطط:</strong> 
          <span style="color:${boundsCheck.status === "outside" ? "red" : boundsCheck.status === "partial" ? "orange" : "green"}">
            ${boundsCheck.message}
          </span>
        </div>
        <div style="margin-bottom: 8px;">
          <strong>نطاق UTM المستنتج:</strong> 
          ${zone ? `<span style="color:blue;">Zone ${zone.number} (WKID: ${zone.wkid})</span>` : '<span style="color:red">خارج النطاقات المتاحة!</span>'}
          </div>
          <div style="margin-bottom: 8px;">
          <strong>مساحة القرار هندسياً (م²):</strong> 
          <span style="color:green; font-weight:bold; font-size:15px;">
            ${projectedArea.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          </span>
        </div>
      `;
    } catch (err) {
      console.error("Spatial Validation Error:", err);
      viewer.innerHTML = `<span style="color:red">حدث خطأ أثناء التحليل المكاني: ${err.message}</span>`;
    }
  }
});
