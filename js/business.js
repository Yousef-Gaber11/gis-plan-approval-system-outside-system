import {
  fetchBureQuery,
  intersectBureQuery,
  createLayer,
  calculateMaxIntersectingArea,
  formatZoneOutput,
  drawPolygon,
  findLayer,
  checkContextBoundary,
  calculateProjectedArea,
  reprojectFeatures,
  calcStatistics,
} from "./templates.js";
import { zonesFeatureCollection } from "./zonesData.js";

export const MUNICIPALITY_CODE = "011001001";
const MUNI_SERVICE_URL =
  "https://gisstg229.momah.gov.sa/server/rest/services/Test/BasicMap/MapServer/4";
const SURVEY_DECISION_URL =
  "https://gisstg229.momah.gov.sa/server/rest/services/Test/EditLayers/mapServer/2";

//* ----------------- Get Zone -----------------
async function getZone(polygon) {
  const fieldsDef = [
    { name: "OBJECTID", type: "oid" },
    { name: "ZONE", type: "integer" },
  ];

  const zonesFeatureLayer = createLayer(zonesFeatureCollection, fieldsDef);
  const intersectingZones = await intersectBureQuery(
    polygon,
    zonesFeatureLayer,
    ["ZONE"],
  );
  const detectedZoneCode = calculateMaxIntersectingArea(
    intersectingZones,
    polygon,
    "ZONE",
  );

  return formatZoneOutput(detectedZoneCode);
}

// * ----------------- Get Municipality -----------------
export async function getMunicipality(view, code = MUNICIPALITY_CODE) {
  //^َ Query
  const feature = await fetchBureQuery(
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

  const context = {
    type: "municipality",
    code: code,
    name:
      (attrs.MUNICIPALITYARNAME || "") +
      (attrs.AMANA ? " - " + attrs.AMANA : ""),
    polygon: muniPolygon,
    zone: zone,
    attributes: attrs,
  };

  //^ Draw
  const layer = await drawPolygon(
    view,
    context.polygon,
    "municipality",
    "حدود البلدية",
  );

  return { context, layer };
}

// * ----------------- Get Survey Decision -----------------
export async function getSurveyDecision(view, krokino) {
  //^ Query
  const feature = await fetchBureQuery(
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
    await reprojectFeatures([{ geometry: decisionPolygon }], finalZone.wkid);
  //^ Calc Area
  const calculatedArea = Math.abs(calculateProjectedArea(metricGeometry));

  const context = {
    type: "decision",
    code: krokino,
    name: `القرار المساحي: ${krokino}`,
    landArea: calculatedArea,
    polygon: geoGeometry,
    metricPolygon: metricGeometry,
    zone: finalZone,
    attributes: attrs,
  };

  //^ Draw
  const layer = await drawPolygon(
    view,
    context.polygon,
    "decision",
    "حدود القرار المساحي",
  );

  return { context, layer };
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
      const reprojectedFeatures = await reprojectFeatures(
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

  const surveyLayer = findLayer(reprojectedLayers, "SurveyS");
  const firstFeature = surveyLayer?.features?.[0];

  if (!firstFeature?.geometry) {
    throw new Error("لم يتم العثور على طبقة SurveyS في الملف المرفوع.");
  }

  //^ Municipality Boundary Check
  const boundsCheck = checkContextBoundary(
    firstFeature.esriGeometry || firstFeature.geometry,
    activeContext.polygon,
    "municipality",
  );

  if (boundsCheck.status === "outside") {
    return { isValid: false, boundsCheck, zone, reprojectedLayers };
  }

  //^ Calc Area
  const projectedArea = Math.abs(
    calculateProjectedArea(firstFeature.geometryUTM),
  );

  //^ Calc Statistics
  const statistics = calcStatistics(
    reprojectedLayers,
    projectedArea,
    activeContext.type,
  );

  return {
    isValid: true,
    boundsCheck,
    zone,
    projectedArea,
    reprojectedLayers,
    statistics,
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
      const reprojectedFeatures = await reprojectFeatures(
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

  console.log(
    "%c=== تقرير فحص طبقات الشيب فايل مع القرار المساحي ===",
    "color: #0088cc; font-weight: bold; font-size: 13px;",
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
      const statusCheck = checkContextBoundary(
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

    if (layerInsideOrPartialCount > 0 && layerOutsideCount === 0) {
      console.log(
        `%c${layer.fileName}: داخل القرار (${layerInsideOrPartialCount})`,
        "color: green;",
      );
    } else if (layerInsideOrPartialCount === 0 && layerOutsideCount > 0) {
      console.log(
        `%c${layer.fileName}: خارج القرار! (${layerOutsideCount})`,
        "color: red;",
      );
    } else if (layerInsideOrPartialCount > 0 && layerOutsideCount > 0) {
      console.log(
        `%c${layer.fileName}: جزئي (جوه: ${layerInsideOrPartialCount}, بره: ${layerOutsideCount})`,
        "color: orange;",
      );
    } else {
      console.log(`[Layer] ${layer.fileName}: لا تحتوي على عناصر صالحة للفحص.`);
    }
  }

  if (globalHasOutside) {
    console.log(
      "%c[Summary]: المخطط يحتوي على بعض العناصر التي تقع خارج حدود القرار",
      "color: orange; font-weight: bold;",
    );
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
  const statistics = calcStatistics(
    reprojectedLayers,
    projectedArea,
    activeContext.type,
  );

  return {
    isValid: true,
    boundsCheck,
    zone,
    projectedArea,
    reprojectedLayers,
    statistics,
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
