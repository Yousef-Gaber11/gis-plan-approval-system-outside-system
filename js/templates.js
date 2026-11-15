import { getEsriModules } from "./esriLibrary.js";
import { LAND_USE, layersDictionary } from "./layersConfig.js";

//! -------------------------------------------       Helper Functions        -----------------------------------

export const getLandUseName = (code) => {
  const use = LAND_USE[String(code)];
  if (use) {
    return `${use.nameAr} / ${use.nameEn}`;
  }
  return "غير معرف / unknown_" + code;
};

export const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const round2 = (n) => Math.round(n * 100) / 100;

export function findLayer(layers, name) {
  return layers.find(
    (l) =>
      (l.fileName || "").split("/").pop().toLowerCase() === name.toLowerCase(),
  );
}

//!-------------------------------------------       Layer List Widget        -----------------------------------

export function setupLayerListWidget(view) {
  const { LayerList, Expand } = getEsriModules();

  const layerList = new LayerList({
    view: view,
    listItemCreatedFunction: function (event) {
      const item = event.item;
      item.panel = {
        content: "legend",
        open: false,
      };
    },
  });
  const expandWidget = new Expand({
    view: view,
    content: layerList,
    expandIcon: "layers",
    expanded: false,
    expandTooltip: "قائمة الطبقات",
  });

  view.ui.add(expandWidget, "top-right");
}
//!-------------------------------------------       Query        -----------------------------------

//* Query
export async function fetchBureQuery(url, whereClause, outFields, errorMsg) {
  const { FeatureLayer } = getEsriModules();

  const layer = new FeatureLayer({ url });
  const result = await layer.queryFeatures({
    where: whereClause,
    outFields,
    returnGeometry: true,
  });

  if (!result.features || result.features.length === 0) {
    throw new Error(errorMsg);
  }
  return result.features[0];
}

//* Query intersecting
export async function intersectBureQuery(
  targetGeometry,
  searchLayer,
  outFields = ["*"],
) {
  const result = await searchLayer.queryFeatures({
    geometry: targetGeometry,
    spatialRelationship: "intersects",
    outFields: outFields,
    returnGeometry: true,
  });

  return result.features || [];
}

//!-------------------------------------------            Zone Detection        -----------------------------------

//* Create Layer
export function createLayer(featureCollection, fieldsDef) {
  const { Polygon, Graphic, FeatureLayer } = getEsriModules();

  const graphics = featureCollection.features.map((feat, index) => {
    const polyGeom = new Polygon({
      rings: feat.geometry.rings,
      spatialReference: feat.geometry.spatialReference,
    });

    const attributes = { ...feat.attributes };
    if (!attributes.OBJECTID) {
      attributes.OBJECTID = index + 1;
    }

    return new Graphic({
      geometry: polyGeom,
      attributes: attributes,
    });
  });

  return new FeatureLayer({
    source: graphics,
    objectIdField: "OBJECTID",
    geometryType: "polygon",
    fields: fieldsDef,
    spatialReference: { wkid: 4326 },
  });
}

//* Calculate zone with the largest intersecting area
export function calculateMaxIntersectingArea(
  intersectingFeatures,
  targetPolygon,
  returnField,
) {
  const { geometryEngine } = getEsriModules();

  let bestMatchValue = null;
  let maxArea = -1;

  for (const f of intersectingFeatures) {
    try {
      const hit = geometryEngine.intersect(f.geometry, targetPolygon);
      if (!hit) continue;

      const area = Math.abs(geometryEngine.geodesicArea(hit, "square-meters"));

      if (area > maxArea) {
        maxArea = area;
        bestMatchValue = f.attributes[returnField];
      }
    } catch (e) {
      console.warn(`تعذر حساب التقاطع للعنصر`, f.attributes, e);
    }
  }
  return bestMatchValue ? Number(bestMatchValue) : null;
}

//* Format Zone
export function formatZoneOutput(detectedZone) {
  if (!detectedZone) return null;

  let finalWkid, finalZoneNumber;
  if (detectedZone < 30000) {
    finalWkid = 32600 + detectedZone;
    finalZoneNumber = detectedZone;
  } else {
    finalZoneNumber = detectedZone - 32600;
    finalWkid = detectedZone;
  }
  return { number: finalZoneNumber, wkid: finalWkid };
}

//!-------------------------------------------       Drawing Polygons        -----------------------------------

//* Draw Polygon (municipality or survey decision)
export async function drawPolygon(view, polygon, contextType, title) {
  const { GraphicsLayer, Graphic } = getEsriModules();

  const layer = new GraphicsLayer({ title: title });

  let fillColor, outlineColor;
  if (contextType === "decision") {
    fillColor = [0, 150, 255, 0.2];
    outlineColor = [0, 100, 255, 0.9];
  } else {
    fillColor = [255, 100, 0, 0.2];
    outlineColor = [255, 69, 0, 0.9];
  }

  const graphic = new Graphic({
    geometry: polygon,
    symbol: {
      type: "simple-fill",
      color: fillColor,
      outline: { color: outlineColor, width: 2.5, style: "dash" },
    },
    attributes: { Name: title },
  });

  layer.add(graphic);
  view.map.add(layer, 0);

  await view.when();
  await view.goTo(polygon.extent.expand(1.3), {
    animate: true,
    easing: "linear",
    duration: 1200,
  });

  return layer;
}

//!-------------------------------------------       Shapefile API  (Backend)      -----------------------------------

// * Parse Shapefile
export async function parseShapefile(file) {
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

  const result = await response.json();
  return Array.isArray(result) ? result : [result];
}

//!-------------------------------------------       Reprojection        -----------------------------------

//* Check is GEO or UTM
export const checkGeographic = (geometry) => {
  if (geometry) {
    let point;

    if (geometry.rings) point = geometry.rings[0][0];
    else if (geometry.paths) point = geometry.paths[0];
    else point = geometry;

    let isGeographic = point.toString().split(".")[0].length == 2;

    return isGeographic;
  }
};

//* Reprojection
export async function reprojectFeatures(
  features,
  targetMetricWkid,
  sourcePrjWkt = "",
  propName = "geometryUTM",
) {
  const { projection, SpatialReference, Polygon, Polyline, Point } =
    getEsriModules();
  if (!projection.isLoaded()) await projection.load();

  if (!features || features.length === 0) return features;

  const wgs84SR = new SpatialReference({ wkid: 4326 });
  const targetMetricSR = new SpatialReference({ wkid: targetMetricWkid });

  const firstGeom = features[0].geometry || features[0].esriGeometry;
  //^ chk is Geographic
  const isGeo = checkGeographic(firstGeom);
  //^ Convert GeoJSON to Esri Geometry
  function toEsriGeom(g, sr) {
    if (!g) return null;
    if (g.declaredClass || g.rings || g.paths || g.x !== undefined) return g;
    if (g.type === "Polygon")
      return new Polygon({ rings: g.coordinates, spatialReference: sr });
    if (g.type === "MultiPolygon")
      return new Polygon({
        rings: g.coordinates.flat(1),
        spatialReference: sr,
      });
    if (g.type === "LineString")
      return new Polyline({ paths: [g.coordinates], spatialReference: sr });
    if (g.type === "MultiLineString")
      return new Polyline({ paths: g.coordinates, spatialReference: sr });
    if (g.type === "Point")
      return new Point({
        x: g.coordinates[0],
        y: g.coordinates[1],
        spatialReference: sr,
      });
    return g;
  }
  //^ Convert Esri Geometry to GeoJSON
  function esriToGeoJSONGeom(esriGeom) {
    if (!esriGeom) return null;
    if (esriGeom.type === "polygon" || esriGeom.rings) {
      const isMulti = esriGeom.rings.length > 1;
      return {
        type: isMulti ? "MultiPolygon" : "Polygon",
        coordinates: isMulti ? esriGeom.rings.map((r) => [r]) : esriGeom.rings,
      };
    }
    if (esriGeom.type === "polyline" || esriGeom.paths) {
      const isMulti = esriGeom.paths.length > 1;
      return {
        type: isMulti ? "MultiLineString" : "LineString",
        coordinates: isMulti ? esriGeom.paths : esriGeom.paths[0],
      };
    }
    if (esriGeom.type === "point" || esriGeom.x !== undefined) {
      return {
        type: "Point",
        coordinates: [esriGeom.x, esriGeom.y],
      };
    }
    return null;
  }

  return features.map((f) => {
    const rawGeom = f.esriGeometry || f.geometry;
    if (!rawGeom) return f;

    let geoGeom = null;
    let utmGeom = null;

    if (isGeo) {
      const esriGeom = toEsriGeom(rawGeom, wgs84SR);
      esriGeom.spatialReference = wgs84SR;
      geoGeom = esriGeom;
      utmGeom = projection.project(esriGeom, targetMetricSR);
    } else {
      const srcSR =
        !rawGeom.spatialReference && sourcePrjWkt
          ? new SpatialReference({ wkt: sourcePrjWkt })
          : rawGeom.spatialReference || targetMetricSR;

      const esriGeom = toEsriGeom(rawGeom, srcSR);
      geoGeom = projection.project(esriGeom, wgs84SR);
      utmGeom = projection.project(esriGeom, targetMetricSR);
    }

    const geoJsonGeometry = esriToGeoJSONGeom(geoGeom) || f.geometry;

    return {
      ...f,
      type: "Feature",
      geometry: geoJsonGeometry, //? GeoJSON for Drawing on Map
      esriGeometry: geoGeom, //? Esri Geometry for Checking Boundary
      [propName]: utmGeom, //? Metric Geometry for Area Calculation
    };
  });
}

//!-------------------------------------------      Chk Boundary & Calc Area        -----------------------------------

//* checkContextBoundary for planExtent and contextPolygon("municipality" or "decision")
export function checkContextBoundary(planExtent, contextPolygon, contextType) {
  const { geometryEngine } = getEsriModules();

  const isInside = geometryEngine.within(planExtent, contextPolygon);
  const isIntersecting = geometryEngine.intersects(planExtent, contextPolygon);

  const targetName = contextType === "decision" ? "القرار المساحي" : "البلدية";

  if (isInside) {
    return {
      status: "inside",
      message: `المخطط يقع بالكامل داخل حدود ${targetName}.`,
    };
  } else if (isIntersecting) {
    return {
      status: "partial",
      message: `المخطط يقع جزئياً خارج حدود ${targetName}.`,
    };
  } else {
    return {
      status: "outside",
      message: `المخطط يقع بالكامل خارج حدود ${targetName}!`,
    };
  }
}

// * fun calculate Area
export function calculateProjectedArea(metricGeometry) {
  const { geometryEngine } = getEsriModules();
  return geometryEngine.planarArea(metricGeometry, "square-meters");
}

//!-------------------------------------------    Statistics from Shapefiles        -----------------------------------

//* Calc Statistics
export function calcStatistics(
  layers,
  fallbackArea = 0,
  contextType = "municipality",
) {
  const survey = findLayer(layers, "SurveyS");
  const parcels = findLayer(layers, "ParcelsPolygonS");
  const streets = findLayer(layers, "PlansStreetsPlygonsS");
  const parking = findLayer(layers, "PlansCarParkingS");
  const lakes = findLayer(layers, "PlansLakesS");

  let planArea = 0;
  if (contextType === "decision") {
    planArea = fallbackArea;
  } else {
    planArea = toNum(survey?.features?.[0]?.properties?.Area);
    if (planArea === 0 && fallbackArea > 0) {
      planArea = fallbackArea;
    }
  }

  const statistics = {
    planArea: round2(planArea),
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
      landuse: code,
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
  for (const k of ["PlansStreetsPlygonsS", "PlansCarParkingS", "PlansLakesS"]) {
    statistics[k].area = round2(statistics[k].area);
    statistics[k].areaPercentage = pct(statistics[k].area);
  }
  return statistics;
}

//* Render Statistics
export function renderStatistics(statistics, statisticsPanel) {
  if (!statisticsPanel) return;
  statisticsPanel.innerHTML = "";
  statisticsPanel.classList.remove("waiting");
  const formatter = new JSONFormatter({ statistics }, 3, {
    hoverPreviewEnabled: false,
    theme: "light",
  });
  statisticsPanel.appendChild(formatter.render());
}

//!-------------------------------------------  Drawing Layers on Map        -----------------------------------

function createMapLayer(geoJson, renderer, labelClass, title) {
  const { GeoJSONLayer } = getEsriModules();
  const validFeatures = (geoJson.features || []).filter(
    (f) => f.geometry && f.geometry.coordinates,
  );

  const featureCollection = {
    type: "FeatureCollection",
    features: validFeatures,
  };
  const blob = new Blob([JSON.stringify(featureCollection)], {
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

export async function drawLayers(geoLayers, view) {
  const map = view.map;
  let overallExtent = null;

  for (const layerData of geoLayers) {
    const layerName = (layerData.fileName || "").split("/").pop().toLowerCase();
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
        `تم تخطي الطبقة ${layerName} لأنها لا تحتوي على بيانات هندسية.`,
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
      if (ext)
        overallExtent = overallExtent ? overallExtent.union(ext) : ext.clone();
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
  }
}
