import * as templates from "./templates.js";
import { zonesFeatureCollection } from "./zonesData.js";

export const MUNICIPALITY_CODE = "011001001";
const MUNI_SERVICE_URL =
  "https://gisstg229.momah.gov.sa/server/rest/services/Test/BasicMap/MapServer/4";
const SURVEY_DECISION_URL =
  "https://gisstg229.momah.gov.sa/server/rest/services/Test/EditLayers/mapServer/2";
const DISTRICTS_SERVICE_URL =
  "https://gisstg229.momah.gov.sa/server/rest/services/Test/BasicMap/MapServer/3";

const STREETS_SERVICE_URL =
  "https://gisstg227.momra.gov.sa/arcgis/rest/services/BaseMap/BasicMap/MapServer/0";
const CITIES_SERVICE_URL =
  "https://gisstg227.momra.gov.sa/arcgis/rest/services/Bundaries/Cities/MapServer/0";
//* ----------------- Get Zone -----------------
async function getZone(polygon) {
  const fieldsDef = [
    { name: "OBJECTID", type: "oid" },
    { name: "ZONE", type: "integer" },
  ];

  const zonesFeatureLayer = templates.createLayer(
    zonesFeatureCollection,
    fieldsDef,
  );
  const intersectingZones = await templates.intersectBureQuery(
    polygon,
    zonesFeatureLayer,
    ["ZONE"],
  );
  const detectedZoneCode = templates.calculateMaxIntersectingArea(
    intersectingZones,
    polygon,
    "ZONE",
  );

  return templates.formatZoneOutput(detectedZoneCode);
}

// * ----------------- Get Municipality -----------------
export async function getMunicipality(code = MUNICIPALITY_CODE) {
  //^َ Query
  const feature = await templates.fetchBureQuery(
    MUNI_SERVICE_URL,
    `MUNICIPALITYUNIQUECODE = '${code}'`,
    ["MUNICIPALITYARNAME", "AMANA"],
    `لم يتم العثور على بيانات البلدية بالكود: ${code}`,
  );

  const attrs = feature.attributes;
  const muniPolygon = feature.geometry;

  //^َ Zone
  const zone = await getZone(muniPolygon);
  if (!zone) {
    throw new Error(
      "تعذر استنتاج الزون، حدود البلدية قد تقع خارج النطاقات المعتمدة.",
    );
  }

  return {
    type: "municipality",
    code: code,
    name:
      (attrs.MUNICIPALITYARNAME || "") +
      (attrs.AMANA ? " - " + attrs.AMANA : ""),
    polygon: muniPolygon,
    zone: zone,
    attributes: attrs,
  };
}

// * ----------------- Get Survey Decision -----------------
export async function getSurveyDecision(krokino) {
  //^ Query
  const feature = await templates.fetchBureQuery(
    SURVEY_DECISION_URL,
    `KROKINO = '${krokino}' and KROKITYPE='7018' and ISAPPROVED = 1`,
    ["KROKINO"],
    `لم يتم العثور على قرار مساحي معتمد مطابق للرقم: ${krokino}`,
  );

  const attrs = feature.attributes;
  const decisionPolygon = feature.geometry;

  //^ Zone
  const finalZone = await getZone(decisionPolygon);
  if (!finalZone) {
    throw new Error(
      "تعذر استنتاج الزون، القرار المساحي قد يقع خارج النطاقات المعتمدة.",
    );
  }

  //^ Projection
  const [{ esriGeometry: geoGeometry, geometryUTM: metricGeometry }] =
    await templates.reprojectFeatures(
      [{ geometry: decisionPolygon }],
      finalZone.wkid,
    );
  //^ Calc Area
  const calculatedArea = Math.abs(
    templates.calculateProjectedArea(metricGeometry),
  );

  return {
    type: "decision",
    code: krokino,
    name: `القرار المساحي: ${krokino}`,
    landArea: calculatedArea,
    polygon: geoGeometry,
    metricPolygon: metricGeometry,
    zone: finalZone,
    attributes: attrs,
  };
}

//*------------------ Draw polygon (Municipality, Survey Decision) -----------------
export async function drawContextPolygon(view, context) {
  if (!view || !context || !context.polygon) return null;

  const title =
    context.type === "decision" ? "حدود القرار المساحي" : "حدود البلدية";

  return await templates.drawPolygon(
    view,
    context.polygon,
    context.type,
    title,
  );
}

//^ ----------------- Intersected Streets & City Info -----------------

//* ----------------- Get Intersected Streets -----------------
export async function getIntersectedStreets(surveyPolygon) {
  if (!surveyPolygon) return [];

  const streetsLayer = templates.createServiceFeatureLayer(STREETS_SERVICE_URL);

  const intersectingFeatures = await templates.intersectBureQuery(
    surveyPolygon,
    streetsLayer,
    ["STREETNAME", "STREETTYPE"],
  );

  return intersectingFeatures.map((f) => {
    const attrs = f.attributes || {};
    return {
      streetType: attrs.STREETTYPE || "لا يوجد",
      streetName: attrs.STREETNAME || "لا يوجد",
    };
  });
}

//* ----------------- Get City Info -----------------
export async function getCityInfo(surveyPolygon) {
  if (!surveyPolygon) return { cityName: "لا يوجد", cityCode: "لا يوجد" };

  const citiesLayer = templates.createServiceFeatureLayer(CITIES_SERVICE_URL);

  const intersectingCities = await templates.intersectBureQuery(
    surveyPolygon,
    citiesLayer,
    ["CITEYARNAME", "CITEYCODE"],
  );

  if (!intersectingCities || intersectingCities.length === 0) {
    return { cityName: null, cityCode: null };
  }

  const attrs = intersectingCities[0].attributes || {};
  return {
    cityName: attrs.CITEYARNAME || null,
    cityCode: attrs.CITEYCODE || null,
  };
}

//* ----------------- Process Plan Validation  -----------------
export async function processPlanValidation(surveyPolygon) {
  let intersectedStreets = [];
  let cityInfo = { cityName: null, cityCode: null };

  try {
    intersectedStreets = await getIntersectedStreets(surveyPolygon);
  } catch (err) {
    console.warn("فشل جلب الشوارع المتقاطعة من MapServer:", err);
  }

  try {
    cityInfo = await getCityInfo(surveyPolygon);
  } catch (err) {
    console.warn("فشل جلب معلومات المدينة من MapServer:", err);
  }

  return {
    IsPlanIntersectsWithStreets: intersectedStreets.length > 0,
    IsPlanIntersectsWithStreetsErrorMessage:
      intersectedStreets.length > 0
        ? "المخطط يتقاطع مع طبقة الشوارع"
        : "المخطط لا يتقاطع مع طبقة الشوارع",
    IntersectedStreetsWithPlan: intersectedStreets,
    cityInfo: cityInfo,
  };
}
//^ ----------------- Process Plan -----------------

//* ----------------- Process Municipality Plan -----------------
async function processMunicipalityPlan(rawLayers, activeContext) {
  const zone = activeContext.zone;
  if (!zone?.wkid) {
    throw new Error(
      "بيانات النطاق الأساسي لا تحتوي على نطاق إحداثيات متري (ZONE) صالح.",
    );
  }

  //^ Reproject all shapefile layers
  const reprojectedLayers = await Promise.all(
    rawLayers.map(async (layer) => {
      const reprojectedFeatures = await templates.reprojectFeatures(
        layer.features || [],
        zone.wkid,
        layer.prj || "",
      );
      return {
        ...layer,
        features: reprojectedFeatures,
      };
    }),
  );

  const surveyLayer = templates.findLayer(reprojectedLayers, "SurveyS");
  const firstFeature = surveyLayer?.features?.[0];

  if (!firstFeature?.geometry) {
    throw new Error("لم يتم العثور على طبقة SurveyS في الملف المرفوع.");
  }

  //^ Municipality Boundary Check
  const boundsCheck = templates.checkContextBoundary(
    firstFeature.esriGeometry || firstFeature.geometry,
    activeContext.polygon,
    "municipality",
  );

  if (boundsCheck.status === "outside") {
    return { isValid: false, boundsCheck, zone, reprojectedLayers };
  }

  //^ Calc Area
  const projectedArea = Math.abs(
    templates.calculateProjectedArea(firstFeature.geometryUTM),
  );

  //^ Calc Statistics
  const statistics = templates.calcStatistics(
    reprojectedLayers,
    projectedArea,
    activeContext.type,
  );

  //^ Validate Plan Rules
  const ideaValidation = templates.validatePlanRules(
    reprojectedLayers,
    activeContext,
  );

  // ^ Process Plan Validation
  const surveyPolygon = firstFeature.esriGeometry;
  const planValidation = await processPlanValidation(surveyPolygon);

  return {
    isValid: true,
    boundsCheck,
    zone,
    projectedArea,
    reprojectedLayers,
    statistics,
    ideaValidation,
    planValidation,
  };
}

//* ----------------- Process Survey Decision Plan -----------------
async function processDecisionPlan(rawLayers, activeContext) {
  const zone = activeContext.zone;
  if (!zone?.wkid) {
    throw new Error(
      "بيانات النطاق الأساسي لا تحتوي على نطاق إحداثيات متري (ZONE) صالح.",
    );
  }

  //^ Reproject all shapefile layers
  const reprojectedLayers = await Promise.all(
    rawLayers.map(async (layer) => {
      const reprojectedFeatures = await templates.reprojectFeatures(
        layer.features || [],
        zone.wkid,
        layer.prj || "",
      );
      return {
        ...layer,
        features: reprojectedFeatures,
      };
    }),
  );

  let globalHasInsideOrPartial = false;
  let globalHasOutside = false;

  for (const layer of reprojectedLayers) {
    if (!layer.features) continue;

    let layerInsideOrPartialCount = 0;
    let layerOutsideCount = 0;

    for (const feature of layer.features) {
      const geom = feature.esriGeometry || feature.geometry;
      if (!geom) continue;
      //^ Check boundary with the decision polygon
      const statusCheck = templates.checkContextBoundary(
        geom,
        activeContext.polygon,
        "decision",
      );

      const isInsideOrPartial =
        statusCheck.status === "inside" || statusCheck.status === "partial";

      if (isInsideOrPartial) {
        layerInsideOrPartialCount++;
        globalHasInsideOrPartial = true;
      } else {
        layerOutsideCount++;
        globalHasOutside = true;
      }
    }
  }

  let finalStatus = "";
  let finalMessage = "";
  let isValid = true;

  if (!globalHasInsideOrPartial) {
    finalStatus = "outside";
    finalMessage = "جميع طبقات المخطط تقع خارج القرار المساحي";
    isValid = false;
  } else if (globalHasOutside) {
    finalStatus = "partial";
    finalMessage = "المخطط مقبول لكن بعض عناصر الطبقات خارج حدود القرار";
    isValid = true;
  } else {
    finalStatus = "inside";
    finalMessage = "جميع طبقات المخطط داخل حدود القرار المساحي";
    isValid = true;
  }

  const boundsCheck = { status: finalStatus, message: finalMessage };

  if (!isValid) {
    return { isValid: false, boundsCheck, zone, reprojectedLayers };
  }

  // ^ Calc Area
  const projectedArea = activeContext.landArea || 0;

  //^ Calc Statistics
  const statistics = templates.calcStatistics(
    reprojectedLayers,
    projectedArea,
    activeContext.type,
  );

  //^ Validate Plan Rules
  const ideaValidation = templates.validatePlanRules(
    reprojectedLayers,
    activeContext,
  );

  // ^ Process Plan Validation
  const surveyPolygon = activeContext.polygon;
  const planValidation = await processPlanValidation(surveyPolygon);

  return {
    isValid: true,
    boundsCheck,
    zone,
    projectedArea,
    reprojectedLayers,
    statistics,
    ideaValidation,
    planValidation,
  };
}

//^ ----------------- Process Plan -----------------
export async function processPlan(rawLayers, activeContext) {
  const contextType = activeContext.type || "municipality";

  if (contextType === "municipality") {
    return processMunicipalityPlan(rawLayers, activeContext);
  }
  return processDecisionPlan(rawLayers, activeContext);
}

//^ ----------------- Get District Name -----------------
export async function getDistrictName(parcelGeometry) {
  if (!parcelGeometry) return "";

  //^ Create FeatureLayer
  const districtsLayer = templates.createServiceFeatureLayer(
    DISTRICTS_SERVICE_URL,
  );

  const intersectingDistricts = await templates.intersectBureQuery(
    parcelGeometry,
    districtsLayer,
    ["DISTRICTARNAME"],
  );

  if (!intersectingDistricts || intersectingDistricts.length === 0) {
    return "غير محدد";
  }

  const attrs = intersectingDistricts[0].attributes;
  return attrs.DISTRICTARNAME || "";
}

//^ ----------------- Get Parcel Details (Data Only) -----------------

export async function getParcelDetails(mapPoint, reprojectedLayers) {
  if (!reprojectedLayers) return null;

  //^ find layer
  const parcelsLayerData = templates.findLayer(
    reprojectedLayers,
    "ParcelsPolygonS",
  );
  if (!parcelsLayerData || !parcelsLayerData.features) return null;

  //^ project mapPoint to WGS84
  const [{ esriGeometry: clickPointGeo }] = await templates.reprojectFeatures(
    [{ geometry: mapPoint }],
    4326,
  );
  if (!clickPointGeo) return null;

  //^ select parcel contains clicked point
  const selectedFeature = templates.findContainingFeature(
    parcelsLayerData.features,
    clickPointGeo,
  );
  if (!selectedFeature) return null;

  //^ extract attributes .shp
  const attributes = templates.getFeatureAttributes(selectedFeature);

  //^ hasParcelLineLessThan15M
  const { hasParcelLineLessThan15M } = singleParcelProcessing(
    selectedFeature.geometryUTM,
  );

  //^ District Name
  const districtName = await getDistrictName(selectedFeature.esriGeometry);

  const finalAttributes = {
    ...attributes,
    hasParcelLineLessThan15M: hasParcelLineLessThan15M,
    DistrictName: districtName,
  };

  return {
    attributes: finalAttributes,
    geometry: selectedFeature.esriGeometry,
  };
}

//^ -----------------Parcel Processing -----------------
//^----------------------------------------------------------------------

export function singleParcelProcessing(metricGeometry) {
  if (
    !metricGeometry ||
    !metricGeometry.rings ||
    metricGeometry.rings.length === 0
  ) {
    return { labelPoints: [], hasParcelLineLessThan15M: false };
  }

  const ring = metricGeometry.rings[0];
  const centroid = templates.calculatePolygonCentroid(metricGeometry, ring);

  const labelPoints = [];
  let hasShortLine = false;

  for (let i = 0; i < ring.length - 1; i++) {
    const p1 = ring[i];
    const p2 = ring[i + 1];

    //^ 1. Length & Check if Short (< 15m)
    const { length, isShort } = templates.calculateLength(
      p1,
      p2,
      metricGeometry.spatialReference,
    );
    if (isShort) hasShortLine = true;

    //^ calculate Direction
    const { direction } = templates.calculateDirection(p1, p2);

    //^  Calculate Label Point (Inside Offset)
    const labelPointGeo = templates.calculateInsideOffsetPoint(
      p1,
      p2,
      centroid,
      metricGeometry.spatialReference,
    );

    labelPoints.push({
      text: `${length} م (${direction})`,
      geometry: labelPointGeo,
      isShort,
    });
  }

  return { labelPoints, hasParcelLineLessThan15M: hasShortLine };
}

//* ----------------- Process All Parcels Dimensions -----------------
export function processAllParcels(reprojectedLayers) {
  const parcelsLayerData = templates.findLayer(
    reprojectedLayers,
    "ParcelsPolygonS",
  );
  if (!parcelsLayerData || !parcelsLayerData.features) return [];

  const allLabels = [];

  for (const feature of parcelsLayerData.features) {
    const metricGeom = feature.geometryUTM;
    const { labelPoints } = singleParcelProcessing(metricGeom);
    allLabels.push(...labelPoints);
  }

  return allLabels;
}
