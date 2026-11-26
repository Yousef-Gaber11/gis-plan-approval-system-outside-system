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

//* Find nearest street to a target parcel geometry
export function findNearestStreet(parcelMetricGeometry, streetFeatures) {
  if (!parcelMetricGeometry || !streetFeatures || streetFeatures.length === 0) {
    return { streetName: "غير محدد", distance: 0 };
  }

  const { geometryEngine } = getEsriModules();

  let minDistance = Infinity;
  let nearestStreetName = "غير محدد";

  for (const street of streetFeatures) {
    let streetGeom = street.geometryUTM;
    if (!streetGeom) continue;

    try {
      const dist = geometryEngine.distance(
        parcelMetricGeometry,
        streetGeom,
        "meters",
      );

      if (dist !== null && dist < minDistance) {
        minDistance = dist;
        const attrs = street.attributes || {};
        nearestStreetName = attrs.STREETNAME || "شارع بدون اسم";
      }
    } catch (e) {
      console.warn("تعذر حساب المسافة للشارع", e);
    }
  }

  return {
    streetName: nearestStreetName,
    distance: Number.isFinite(minDistance) ? round2(minDistance) : 0,
  };
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
  whereClause = "1=1",
) {
  const result = await searchLayer.queryFeatures({
    geometry: targetGeometry,
    spatialRelationship: "intersects",
    where: whereClause,
    outFields: outFields,
    returnGeometry: true,
  });

  return result.features || [];
}

//* Create Service FeatureLayer from URL
export function createServiceFeatureLayer(url) {
  const { FeatureLayer } = getEsriModules();
  return new FeatureLayer({ url });
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
//^ draw overlap
//^ draw urbanArea
//* Draw Generic Polygon
export async function drawPolygon(view, polygon, options = {}) {
  const { GraphicsLayer, Graphic } = getEsriModules();

  const {
    title = "طبقة مضلع",
    fillColor = [0, 0, 0, 0],
    outlineColor = [0, 0, 0, 1],
    outlineWidth = 2.5,
    outlineStyle = "solid",
    index = undefined,
    skipZoom = false,
    zoomExpand = 1.3,
  } = options;

  const layer = new GraphicsLayer({ title });

  const graphic = new Graphic({
    geometry: polygon,
    symbol: {
      type: "simple-fill",
      color: fillColor,
      outline: {
        color: outlineColor,
        width: outlineWidth,
        style: outlineStyle,
      },
    },
    attributes: { Name: title },
  });

  layer.add(graphic);

  if (typeof index === "number") {
    view.map.add(layer, index);
  } else {
    view.map.add(layer);
  }

  if (!skipZoom && polygon.extent) {
    await view.when();
    await view.goTo(polygon.extent.expand(zoomExpand), {
      animate: true,
      easing: "linear",
      duration: 1200,
    });
  }

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
      attributes: f.attributes || {},
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
    planArea = toNum(survey?.features?.[0]?.attributes?.Area);
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
    const p = feature.attributes;
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
    (layer?.features ?? []).reduce((s, f) => s + toNum(f.attributes.Area), 0);

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

//!-------------------------------------------    Plan Validation Rules        -----------------------------------

export function validatePlanRules(layers, activeContext) {
  const parcels = findLayer(layers, "ParcelsPolygonS");
  const streetsPolygons = findLayer(layers, "PlansStreetsPlygonsS");
  const streetsLines = findLayer(layers, "PlansStreetsLineL");
  const blocks = findLayer(layers, "PlanBlocksS");
  const lakes = findLayer(layers, "PlansLakesS");
  const islands = findLayer(layers, "PlansRoadIslandsS");
  const pathways = findLayer(layers, "WalkPathWaysS");
  const parking = findLayer(layers, "PlansCarParkingS");

  const contextPoly = activeContext?.polygon;
  const { geometryEngine } = getEsriModules();

  //* Check if a layer is completely within the context polygon
  const checkLayerWithin = (layer, errorMsg) => {
    if (!layer || !layer.features || layer.features.length === 0) {
      return { isWithin: true, error: null };
    }
    const allInside = layer.features.every((f) => {
      const geom = f.esriGeometry || f.geometry;
      return geom ? geometryEngine.within(geom, contextPoly) : true;
    });
    return {
      isWithin: allInside,
      error: allInside ? null : errorMsg,
    };
  };

  const blocksCheck = checkLayerWithin(
    blocks,
    "البلوكات او جزء منها خارج حدود المخطط",
  );
  const lakesCheck = checkLayerWithin(
    lakes,
    "البحيرات او جزء منها خارج حدود المخطط",
  );
  const islandsCheck = checkLayerWithin(
    islands,
    "الجزر الوسطية او جزء منها خارج حدود المخطط",
  );
  const streetsCheck = checkLayerWithin(
    streetsLines,
    "الشوارع او جزء منها خارج حدود المخطط",
  );

  const streetsPolyCheck = checkLayerWithin(
    streetsPolygons,
    "طبقة مضلع الشوارع او جزء منها خارج المخطط",
  );
  const pathwaysCheck = checkLayerWithin(
    pathways,
    "ممرات المشاة او جزء منها خارج حدود المخطط",
  );
  const parcelsCheck = checkLayerWithin(
    parcels,
    "قطع الأراضي او جزء منها خارج حدود المخطط",
  );
  const parkingCheck = checkLayerWithin(
    parking,
    "مواقف السيارات او جزء منها خارج حدود المخطط",
  );

  //* Check if any parcels intersect with each other
  let isParcelsIntersects = false;
  if (parcels?.features?.length > 1) {
    for (let i = 0; i < parcels.features.length; i++) {
      for (let j = i + 1; j < parcels.features.length; j++) {
        const g1 =
          parcels.features[i].esriGeometry || parcels.features[i].geometry;
        const g2 =
          parcels.features[j].esriGeometry || parcels.features[j].geometry;
        // change "intersects" to "overlaps"
        if (g1 && g2 && geometryEngine.overlaps(g1, g2)) {
          isParcelsIntersects = true;
          break;
        }
      }
      if (isParcelsIntersects) break;
    }
  }

  //* Check if any streets intersect with parcels
  const streetLayerForParcels = streetsPolygons || streetsLines;
  let isStreetsIntersectsWithParcels = false;
  if (streetLayerForParcels?.features && parcels?.features) {
    for (const sf of streetLayerForParcels.features) {
      const sg = sf.esriGeometry || sf.geometry;
      if (!sg) continue;
      for (const pf of parcels.features) {
        const pg = pf.esriGeometry || pf.geometry;
        if (pg && geometryEngine.intersects(sg, pg)) {
          isStreetsIntersectsWithParcels = true;
          break;
        }
      }
      if (isStreetsIntersectsWithParcels) break;
    }
  }

  return {
    isBlocksWithinPlan: blocksCheck.isWithin,
    isBlocksWithinPlanErrorMessage: blocksCheck.error,
    isPlansLakesWithinPlan: lakesCheck.isWithin,
    isPlansLakesWithinPlanErrorMessage: lakesCheck.error,
    isRoadIslandsWithinPlan: islandsCheck.isWithin,
    isRoadIslandsWithinPlanErrorMessage: islandsCheck.error,
    isStreetsWithinPlan: streetsCheck.isWithin,
    isStreetsWithinPlanErrorMessage: streetsCheck.error,
    isStreetsIntersectsWithParcels: isStreetsIntersectsWithParcels,
    isStreetsIntersectsWithParcelsErrorMessage: isStreetsIntersectsWithParcels
      ? "الشوارع تتقاطع مع قطع الأراضي"
      : null,
    isPlansStreetsPlygonsWithinPlan: streetsPolyCheck.isWithin,
    isPlansStreetsPlygonsWithinPlanErrorMessage: streetsPolyCheck.error,
    isWalkPathWaysWithinPlan: pathwaysCheck.isWithin,
    isWalkPathWaysWithinPlanErrorMessage: pathwaysCheck.error,
    isAllParcelsWithinPlan: parcelsCheck.isWithin,
    isAllParcelsWithinPlanErrorMessage: parcelsCheck.error,
    isPlansCarParkingWithinPlan: parkingCheck.isWithin,
    isPlansCarParkingWithinPlanErrorMessage: parkingCheck.error,
    isParcelsIntersects: isParcelsIntersects,
    isParcelsIntersectsErrorMessage: isParcelsIntersects
      ? "توجد قطع أراضي متداخلة فيما بينها"
      : null,
    isParcelsLayerExist: Boolean(parcels && parcels.features?.length > 0),
  };
}

//!-------------------------------------------    Render (Statistics,validation)        -----------------------------------

//* Render Statistics & Validation
export function renderStatistics(combinedReport, statisticsPanel) {
  if (!statisticsPanel) return;
  statisticsPanel.innerHTML = "";
  statisticsPanel.classList.remove("waiting");

  const formatter = new JSONFormatter(combinedReport, 3, {
    hoverPreviewEnabled: false,
    theme: "light",
  });
  statisticsPanel.appendChild(formatter.render());
}

//!-------------------------------------------  Drawing Layers on Map        -----------------------------------

function createMapLayer(geoJson, renderer, labelClass, title) {
  const { GeoJSONLayer } = getEsriModules();
  const validFeatures = (geoJson.features || [])
    .filter((f) => f.geometry && (f.geometry.coordinates || f.esriGeometry))
    .map((f) => ({
      type: "Feature",
      geometry: f.geometry,
      properties: f.attributes || {},
    }));

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
//!-------------------------------------------  Helpers -----------------------------------

//* Calculate Centroid of Ring Metric Geometry
export function calculatePolygonCentroid(metricGeometry, ring) {
  if (metricGeometry.centroid) return metricGeometry.centroid;

  let sumX = 0,
    sumY = 0;
  const len = ring.length - 1;
  for (let i = 0; i < len; i++) {
    sumX += ring[i][0];
    sumY += ring[i][1];
  }
  return { x: sumX / len, y: sumY / len };
}

//* Calculate Metric Segment Length
export function calculateLength(p1, p2, spatialReference) {
  const { geometryEngine, Polyline } = getEsriModules();
  const lineMetric = new Polyline({
    paths: [
      [
        [p1[0], p1[1]],
        [p2[0], p2[1]],
      ],
    ],
    spatialReference,
  });
  const length = round2(geometryEngine.planarLength(lineMetric, "meters"));
  return { length, isShort: length <= 15 };
}

//* Calculate Azimuth Angle and Direction Text
export function calculateDirection(p1, p2) {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  let angleRad = Math.atan2(dx, dy);
  let angleDeg = (angleRad * 180) / Math.PI;
  if (angleDeg < 0) angleDeg += 360;

  let direction = "شمال";
  if (angleDeg >= 45 && angleDeg < 135) direction = "شرق";
  else if (angleDeg >= 135 && angleDeg < 225) direction = "جنوب";
  else if (angleDeg >= 225 && angleDeg < 315) direction = "غرب";

  return { direction };
}

//* Calculate Inside Offset Label Point (WGS84 Projected)
export function calculateInsideOffsetPoint(p1, p2, centroid, spatialReference) {
  const { Point, projection } = getEsriModules();

  const midX = (p1[0] + p2[0]) / 2;
  const midY = (p1[1] + p2[1]) / 2;
  const offsetX = midX + (centroid.x - midX) * 0.12;
  const offsetY = midY + (centroid.y - midY) * 0.12;

  const offsetPointMetric = new Point({
    x: offsetX,
    y: offsetY,
    spatialReference,
  });

  return projection.project(offsetPointMetric, { wkid: 4326 });
}

//! ----------------- Draw All Parcel Line Labels -----------------

let parcelLabelsGraphicsLayer = null;
export function drawAllParcelLineLabels(view, allLabelsData) {
  const { GraphicsLayer, Graphic } = getEsriModules();

  if (!parcelLabelsGraphicsLayer) {
    parcelLabelsGraphicsLayer = new GraphicsLayer({
      title: "أبعاد وأطوال قطع الأراضي",
      minScale: 1000,
      maxScale: 0,
    });
    view.map.add(parcelLabelsGraphicsLayer);
  } else {
    if (!view.map.layers.includes(parcelLabelsGraphicsLayer)) {
      view.map.add(parcelLabelsGraphicsLayer);
    }
    parcelLabelsGraphicsLayer.removeAll();
  }

  if (!allLabelsData || allLabelsData.length === 0) return;

  allLabelsData.forEach((item) => {
    if (!item.geometry) return;

    const textColor = item.isShort ? [220, 20, 60, 1] : [20, 20, 100, 1];

    const textSymbol = {
      type: "text",
      color: textColor,
      text: item.text,
      font: { size: 8, weight: "bold", family: "sans-serif" },
    };

    const graphic = new Graphic({
      geometry: item.geometry,
      symbol: textSymbol,
    });

    parcelLabelsGraphicsLayer.add(graphic);
  });
}

//!-------------------------------------------  Parcel Selection   -----------------------------------

//* Find feature containing a target point
export function findContainingFeature(features, targetPointGeo) {
  if (!features || features.length === 0 || !targetPointGeo) return null;

  const { geometryEngine } = getEsriModules();

  return (
    features.find((f) => {
      const geom = f.esriGeometry || f.geometry;
      return geom ? geometryEngine.contains(geom, targetPointGeo) : false;
    }) || null
  );
}

export function getFeatureAttributes(feature) {
  return feature.attributes;
}

//* highlight Parcel
let highlightGraphicsLayer = null;
export function highlightParcel(view, esriGeometry) {
  const { GraphicsLayer, Graphic } = getEsriModules();

  if (!highlightGraphicsLayer) {
    highlightGraphicsLayer = new GraphicsLayer({ title: "القطعة المختارة" });
    view.map.add(highlightGraphicsLayer);
  } else {
    if (!view.map.layers.includes(highlightGraphicsLayer)) {
      view.map.add(highlightGraphicsLayer);
    }
    highlightGraphicsLayer.removeAll();
  }

  if (!esriGeometry) return;

  const graphic = new Graphic({
    geometry: esriGeometry,
    symbol: {
      type: "simple-fill",
      color: [255, 255, 0, 0.35],
      outline: {
        color: [255, 215, 0, 1],
        width: 3,
      },
    },
  });
  highlightGraphicsLayer.add(graphic);
}

//* Render Parcel Viewer
export function renderParcelViewer(
  parcelData,
  combinedReport,
  statisticsPanel,
) {
  if (!statisticsPanel) return;
  statisticsPanel.innerHTML = "";

  const backBtn = document.createElement("button");
  backBtn.style.cssText = `
      display: block;
      margin-bottom: 12px;
      padding: 7px 14px;
      background-color: #007acc;
      color: #ffffff;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      font-weight: bold;
    `;
  backBtn.textContent = "العودة إلى تقرير المخطط الإجمالي";

  backBtn.onclick = () => {
    if (highlightGraphicsLayer) {
      highlightGraphicsLayer.removeAll();
    }
    renderStatistics(combinedReport, statisticsPanel);
  };

  statisticsPanel.appendChild(backBtn);

  const formatter = new JSONFormatter(parcelData, 1, {
    hoverPreviewEnabled: true,
    theme: "light",
  });
  statisticsPanel.appendChild(formatter.render());
}

//! التحققات المطلوبة على الفكرة التصميمية
//!------------------------------------------- Design Concept Validations -----------------------------------

//* return attributes value by field name (case-insensitive)
export function findAttributeValue(attributes, fieldName) {
  if (!attributes) return undefined;
  const targetKey = fieldName.toLowerCase();
  const matchedKey = Object.keys(attributes).find(
    (key) => key.toLowerCase() === targetKey,
  );
  return matchedKey ? attributes[matchedKey] : undefined;
}

//* Validator
export function requiredValidationsForDesignConcept(layers, rules = []) {
  const warnings = [];

  for (const rule of rules) {
    const { layerName, required = false, minFeatures, fields = [] } = rule;

    const targetLayer = findLayer(layers, layerName);

    //* ----------------------  STOOPER -------------------
    //^ Required layer chk exists
    if (required && !targetLayer) {
      return {
        isValid: false,
        error: `طبقة (${layerName}) إجبارية وغير موجودة بالملف المرفوع.`,
        layerName,
        fieldName: "N/A",
      };
    }

    //^ Required layer chk  at least one feature
    if (targetLayer && minFeatures !== undefined) {
      const count = targetLayer.features ? targetLayer.features.length : 0;
      if (count < minFeatures) {
        return {
          isValid: false,
          error: `طبقة (${layerName}) يجب أن تحتوي على ${minFeatures} عنصر على الأقل.`,
          layerName,
          fieldName: "N/A",
        };
      }
    }

    if (
      !targetLayer ||
      !targetLayer.features ||
      targetLayer.features.length === 0
    ) {
      continue;
    }

    const uniqueTrackers = {};

    for (let i = 0; i < targetLayer.features.length; i++) {
      const feat = targetLayer.features[i];
      const attrs = feat.attributes || {};

      for (const fieldRule of fields) {
        const { name, minVal, unique = false } = fieldRule;

        //^  Get field value
        const val = findAttributeValue(attrs, name);

        //^ chk field (required or minVal) contains a value
        if (unique || minVal !== undefined) {
          if (val === undefined || val === null || String(val).trim() === "") {
            return {
              isValid: false,
              error: `العنصر رقم ${i + 1} في طبقة (${layerName}) لا يحتوي على قيمة للحقل (${name}).`,
              layerName,
              fieldName: name,
            };
          }
        }

        // PARCELNO
        //^ chk field value is unique
        if (unique) {
          const strVal = String(val).trim();
          uniqueTrackers[name] = uniqueTrackers[name] || new Set();
          if (uniqueTrackers[name].has(strVal)) {
            return {
              isValid: false,
              error: `رقم قطعة الأرض / القيمة (${strVal}) مكررة في الحقل (${name}) داخل طبقة (${layerName}).`,
              layerName,
              fieldName: name,
            };
          }
          uniqueTrackers[name].add(strVal);
        }

        // Area & STLENGHT
        //^ chk field value is greater than minVal
        if (minVal !== undefined) {
          const numVal = toNum(val);
          if (numVal <= minVal) {
            return {
              isValid: false,
              error: `العنصر رقم ${i + 1} في طبقة (${layerName}) يحتوي على قيمة للحقل (${name}) أقل من أو تساوي ${minVal}.`,
              layerName,
              fieldName: name,
            };
          }
        }
      }
    }
  }

  //*------------------
  for (const rule of rules) {
    const { layerName, noSelfOverlap = false } = rule;
    const targetLayer = findLayer(layers, layerName);
    //* -----------------  Warning: Check Self Overlap -----------------
    if (noSelfOverlap && targetLayer.features.length > 1) {
      const { geometryEngine } = getEsriModules();
      const feats = targetLayer.features;

      //!TEST
      // if (feats.length > 0) {
      //   //! 1
      //   // feats[1].geometryUTM = feats[0].geometryUTM;
      //   //! 2
      //   const origGeom = feats[0].geometryUTM;
      //   if (origGeom) {
      //     feats[0].geometryUTM = geometryEngine.buffer(origGeom, 10, "meters");
      //   }
      // }

      for (let i = 0; i < feats.length; i++) {
        for (let j = i + 1; j < feats.length; j++) {
          // const g1 = feats[i].geometryUTM;
          //! TEST
          const g1 =
            i === 0 && feats[i].geometryUTM
              ? geometryEngine.buffer(feats[i].geometryUTM, 10, "meters")
              : feats[i].geometryUTM;
          const g2 = feats[j].geometryUTM;

          if (g1 && g2) {
            const intersectionGeom = geometryEngine.intersect(g1, g2);

            if (intersectionGeom) {
              const overlapArea = geometryEngine.planarArea(
                intersectionGeom,
                "square-meters",
              );

              if (overlapArea > 0.01) {
                const p1 =
                  findAttributeValue(feats[i].attributes, "PARCELNO") ||
                  `#${i + 1}`;
                const p2 =
                  findAttributeValue(feats[j].attributes, "PARCELNO") ||
                  `#${j + 1}`;

                const { projection, SpatialReference } = getEsriModules();
                let geoIntersection = intersectionGeom;
                if (projection.isLoaded()) {
                  geoIntersection = projection.project(
                    intersectionGeom,
                    new SpatialReference({ wkid: 4326 }),
                  );
                }

                warnings.push({
                  type: "SELF_OVERLAP",
                  layerName,
                  message: `تداخل بمسافة (${round2(overlapArea)} م²) بين القطعة (${p1}) والقطعة (${p2}) داخل طبقة (${layerName}).`,
                  polygon: geoIntersection,
                });
              }
            }
          }
        }
      }
    }
  }
  //*------------------

  return { isValid: true, warnings };
}

//!---------------------------------------------------------      النطاق العمراني -----------------------------------

//!-------------------------------------------      Spatial Split & Math Calculations        -----------------------------------

export async function calculateUrbanBoundarySplit(
  surveyPolygon,
  urbanPolygon,
  targetWkid,
) {
  if (!surveyPolygon || !urbanPolygon) return null;

  const { geometryEngine } = getEsriModules();

  //? Intersection & Difference
  const insideGeometry = geometryEngine.intersect(surveyPolygon, urbanPolygon);
  const outsideGeometry = geometryEngine.difference(
    surveyPolygon,
    urbanPolygon,
  );

  let insideArea = 0;
  let outsideArea = 0;

  //? (UTM) -> zone & calc area
  if (insideGeometry) {
    const [{ geometryUTM: insideUTM }] = await reprojectFeatures(
      [{ geometry: insideGeometry }],
      targetWkid,
    );
    insideArea = round2(Math.abs(calculateProjectedArea(insideUTM)));
  }
  if (outsideGeometry) {
    const [{ geometryUTM: outsideUTM }] = await reprojectFeatures(
      [{ geometry: outsideGeometry }],
      targetWkid,
    );
    outsideArea = round2(Math.abs(calculateProjectedArea(outsideUTM)));
  }

  //? calc percentage
  const totalArea = insideArea + outsideArea;
  const insidePercentage =
    totalArea > 0 ? round2((insideArea / totalArea) * 100) : 0;
  const outsidePercentage =
    totalArea > 0 ? round2((outsideArea / totalArea) * 100) : 0;

  return {
    insideGeometry,
    outsideGeometry,
    insideArea,
    outsideArea,
    insidePercentage,
    outsidePercentage,
  };
}

//!-------------------------------------------      Red Zones Overlap Analysis        -----------------------------------

export async function calculateLayersOverlap(
  surveyPolygon,
  serviceUrl,
  layerIds = [],
  targetWkid,
  surveyArea = null,
) {
  if (!surveyPolygon || !serviceUrl || layerIds.length === 0) {
    return [];
  }

  const { geometryEngine } = getEsriModules();
  const overlapResults = [];

  //? loop by ID to chk intersection with each layer -> calc area & percentage
  for (const id of layerIds) {
    try {
      const layerUrl = `${serviceUrl}/${id}`;
      const searchLayer = createServiceFeatureLayer(layerUrl);

      const intersectedFeatures = await intersectBureQuery(
        surveyPolygon,
        searchLayer,
        [],
      );

      if (intersectedFeatures && intersectedFeatures.length > 0) {
        let combinedGeom = intersectedFeatures[0].geometry;
        for (let i = 1; i < intersectedFeatures.length; i++) {
          const unioned = geometryEngine.union([
            combinedGeom,
            intersectedFeatures[i].geometry,
          ]);
          if (unioned) combinedGeom = unioned;
        }

        const hitGeom = geometryEngine.intersect(surveyPolygon, combinedGeom);
        if (hitGeom) {
          const [{ geometryUTM: hitUTM }] = await reprojectFeatures(
            [{ geometry: hitGeom }],
            targetWkid,
          );
          const overlappingArea = round2(
            Math.abs(calculateProjectedArea(hitUTM)),
          );

          if (overlappingArea > 0) {
            const overlappingPercentage =
              surveyArea > 0 ? round2((overlappingArea / surveyArea) * 100) : 0;

            overlapResults.push({
              layerId: id,
              overlappingArea,
              overlappingPercentage,
            });
          }
        }
      }
    } catch (err) {
      console.warn(`تعذر فحص التقاطع للطبقة ID ${id}:`, err);
    }
  }

  return overlapResults;
}

//* Helper لعرض النطاق العمراني المعتمد وقائمة النطاقات التفاعلية
export function renderPlanValidation(reportData, planValidationPanel) {
  if (!planValidationPanel) return;

  if (!reportData) {
    planValidationPanel.innerHTML = "في انتظار جلب البيانات...";
    planValidationPanel.classList.add("waiting");
    return;
  }

  planValidationPanel.innerHTML = "";
  planValidationPanel.classList.remove("waiting");

  const formatter = new JSONFormatter(reportData, 3, {
    hoverPreviewEnabled: false,
    theme: "light",
  });

  planValidationPanel.appendChild(formatter.render());
}
