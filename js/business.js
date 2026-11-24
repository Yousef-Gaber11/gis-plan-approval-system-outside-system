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

const URBAN_AREA_SERVICE_URL =
  "https://netaqgis.momra.gov.sa/arcgis/rest/services/NetaqWithHaizService/MapServer/0";

//!----------------- Design Concept Rules -----------------
const DESIGN_CONCEPT_RULES = [
  {
    layerName: "ParcelsPolygonS",
    required: true,
    minFeatures: 1,
    noSelfOverlap: true, //^ Check for self-overlapping polygons
    fields: [
      { name: "PARCELNO", unique: false }, //unique: true
      { name: "Area", minVal: 0 }, //10000000000000000
    ],
  },
  {
    layerName: "PlansStreetsLineL",
    fields: [{ name: "STLENGHT", minVal: 0 }], //10000000000000000
  },
  {
    layerName: "PlansStreetsPlygonsS",
    fields: [{ name: "Area", minVal: 0 }],
  },
  { layerName: "PlansCarParkingS", fields: [{ name: "Area", minVal: 0 }] },
  { layerName: "PlansLakesS", fields: [{ name: "Area", minVal: 0 }] },
  { layerName: "PlanBlocksS", fields: [{ name: "Area", minVal: 0 }] },
];

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

  //^ ----------------  فحص النطاق العمراني ----------------
  const urbanAreaInfo = await checkUrbanAreaBoundary(
    geoGeometry,
    finalZone.wkid,
  );
  //^ --------------------------------------------------------

  return {
    type: "decision",
    code: krokino,
    name: `القرار المساحي: ${krokino}`,
    landArea: calculatedArea,
    polygon: geoGeometry,
    metricPolygon: metricGeometry,
    zone: finalZone,
    urbanAreaInfo: urbanAreaInfo,
    attributes: attrs,
  };
}

//*------------------ Draw polygon (Municipality, Survey Decision) -----------------
export async function drawContextPolygon(view, context) {
  if (!view || !context || !context.polygon) return null;

  const isDecision = context.type === "decision";

  if (isDecision && context.urbanAreaInfo?.splitAnalysis) {
    const { insideGeometry, outsideGeometry } =
      context.urbanAreaInfo.splitAnalysis;
    const layers = [];

    if (insideGeometry) {
      const insideLayer = await templates.drawPolygon(view, insideGeometry, {
        title: "القرار المساحي - داخل النطاق",
        fillColor: [76, 175, 80, 0.35],
        outlineColor: [46, 125, 50, 0.9],
        outlineStyle: "solid",
        outlineWidth: 2.5,
        index: 0,
        skipZoom: false,
      });
      layers.push(insideLayer);
    }

    if (outsideGeometry) {
      const outsideLayer = await templates.drawPolygon(view, outsideGeometry, {
        title: "القرار المساحي - خارج النطاق",
        fillColor: [244, 67, 54, 0.35],
        outlineColor: [211, 47, 47, 0.9],
        outlineStyle: "solid",
        outlineWidth: 2.5,
        index: 0,
        skipZoom: true,
      });
      layers.push(outsideLayer);
    }

    return layers;
  }

  return await templates.drawPolygon(view, context.polygon, {
    title: "حدود البلدية",
    fillColor: [255, 100, 0, 0.2],
    outlineColor: [255, 69, 0, 0.9],
    outlineStyle: "dash",
    outlineWidth: 2.5,
    index: 0,
    skipZoom: false,
    zoomExpand: 1.3,
  });
}

//* ----------------- Check Urban Area Boundary -----------------
//*
export async function checkUrbanAreaBoundary(surveyPolygon, targetWkid) {
  if (!surveyPolygon) return null;

  const urbanAreaLayer = templates.createServiceFeatureLayer(
    URBAN_AREA_SERVICE_URL,
  );

  const outFields = [
    "URBANAREABOUNDARY_ID",
    "URBANAREABOUNDARYCODE",
    "URBANAREABOUNDARYTYPE",
    "URBANAREABOUNDARYNAME_AR",
    "URBANAREABOUNDARYYEAR",
    "NETAQ_CONDITION",
    "URBANAREABOUNDARY_UNIFIED_ID",
  ];

  //^ Query
  const intersectedFeatures = await templates.intersectBureQuery(
    surveyPolygon,
    urbanAreaLayer,
    outFields,
    "URBANAREABOUNDARYTYPE <> 3",
  );

  if (!intersectedFeatures || intersectedFeatures.length === 0) {
    return {
      overallStatus: "خارج النطاق",
      urbanBoundariesList: [],
      message: "القرار المساحي يقع بالكامل خارج النطاق العمراني المعتمد.",
    };
  }

  //^ sort (extract year number from URBANAREABOUNDARYYEAR and sort descending)
  const extractYearNumber = (val) => {
    if (!val) return 0;
    const digits = String(val).replace(/\D/g, "");
    return parseInt(digits, 10) || 0;
  };
  const sortedFeatures = [...intersectedFeatures].sort((a, b) => {
    const yearA = extractYearNumber(a.attributes?.URBANAREABOUNDARYYEAR);
    const yearB = extractYearNumber(b.attributes?.URBANAREABOUNDARYYEAR);
    return yearB - yearA;
  });

  const latestFeature = sortedFeatures[0];
  // console.log("Rings count:", latestFeature.geometry.rings?.length);

  //^ chk
  const boundaryCheck = templates.checkContextBoundary(
    surveyPolygon,
    latestFeature.geometry,
    "النطاق العمراني",
  );

  let overallStatus = "";
  if (boundaryCheck.status === "inside") {
    overallStatus = "داخل النطاق";
  } else if (boundaryCheck.status === "partial") {
    overallStatus = "جزء داخل وجزء خارج";
  } else {
    overallStatus = "خارج النطاق";
  }

  //^ Split Analysis
  const splitAnalysis = await templates.calculateUrbanBoundarySplit(
    surveyPolygon,
    latestFeature.geometry,
    targetWkid,
  );

  const urbanBoundariesList = sortedFeatures.map((f) => {
    const attrs = f.attributes || {};
    return {
      URBANAREABOUNDARY_ID: attrs.URBANAREABOUNDARY_ID,
      URBANAREABOUNDARYCODE: attrs.URBANAREABOUNDARYCODE,
      URBANAREABOUNDARYTYPE: attrs.URBANAREABOUNDARYTYPE,
      URBANAREABOUNDARYNAME_AR: attrs.URBANAREABOUNDARYNAME_AR,
      URBANAREABOUNDARYYEAR: attrs.URBANAREABOUNDARYYEAR,
      NETAQ_CONDITION: attrs.NETAQ_CONDITION,
      URBANAREABOUNDARY_UNIFIED_ID: attrs.URBANAREABOUNDARY_UNIFIED_ID,
    };
  });

  return {
    overallStatus: overallStatus,
    geometry: latestFeature.geometry,
    splitAnalysis,
    urbanBoundariesList: urbanBoundariesList,
    message:
      overallStatus === "داخل النطاق"
        ? "القرار المساحي يقع بالكامل داخل النطاق العمراني."
        : "جزء من القرار المساحي يقع خارج حدود النطاق العمراني.",
  };
}
//* ----------------- Draw Urban Area Polygon -----------------
export async function drawUrbanAreaPolygon(view, urbanAreaInfo) {
  if (!view || !urbanAreaInfo || !urbanAreaInfo.geometry) return null;

  return await templates.drawPolygon(view, urbanAreaInfo.geometry, {
    title: "حدود النطاق العمراني المعتمد",
    fillColor: [0, 0, 0, 0],
    outlineColor: [46, 125, 50, 1],
    outlineStyle: "short-dash",
    outlineWidth: 2.5,
    index: 1,
    skipZoom: true,
  });
}

//^ ----------------- Intersected Streets & City Info -----------------

//* ----------------- Get Intersected Streets -----------------
export async function getIntersectedStreets(surveyPolygon, targetWkid) {
  if (!surveyPolygon) return { formattedStreets: [], rawStreetFeatures: [] };

  const streetsLayer = templates.createServiceFeatureLayer(STREETS_SERVICE_URL);

  const intersectingFeatures = await templates.intersectBureQuery(
    surveyPolygon,
    streetsLayer,
    ["STREETNAME", "STREETTYPE"],
  );

  const projectedStreets = await templates.reprojectFeatures(
    intersectingFeatures,
    targetWkid,
    "",
    "geometryUTM",
  );

  const formattedStreets = intersectingFeatures.map((f) => {
    const attrs = f.attributes || {};
    return {
      streetType: attrs.STREETTYPE || "لا يوجد",
      streetName: attrs.STREETNAME || "لا يوجد",
    };
  });

  return {
    formattedStreets,
    rawStreetFeatures: projectedStreets,
  };
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
export async function processPlanValidation(surveyPolygon, targetWkid) {
  let intersectedStreets = [];
  let rawStreetFeatures = [];
  let cityInfo = { cityName: null, cityCode: null };

  try {
    const streetsData = await getIntersectedStreets(surveyPolygon, targetWkid);
    intersectedStreets = streetsData.formattedStreets;
    rawStreetFeatures = streetsData.rawStreetFeatures;
  } catch (err) {
    console.warn("فشل جلب الشوارع المتقاطعة من MapServer:", err);
  }

  try {
    cityInfo = await getCityInfo(surveyPolygon);
  } catch (err) {
    console.warn("فشل جلب معلومات المدينة من MapServer:", err);
  }

  return {
    planValidation: {
      IsPlanIntersectsWithStreets: intersectedStreets.length > 0,
      IsPlanIntersectsWithStreetsErrorMessage:
        intersectedStreets.length > 0
          ? "المخطط يتقاطع مع طبقة الشوارع"
          : "المخطط لا يتقاطع مع طبقة الشوارع",
      IntersectedStreetsWithPlan: intersectedStreets,
      cityInfo: cityInfo,
    },
    rawStreetFeatures: rawStreetFeatures,
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

  //^ Validate Design Concept Rules
  const designValidation = templates.requiredValidationsForDesignConcept(
    reprojectedLayers,
    DESIGN_CONCEPT_RULES,
  );
  if (!designValidation.isValid) {
    return {
      isValid: false,
      designValidationError: designValidation,
    };
  }

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
  const { planValidation, rawStreetFeatures } = await processPlanValidation(
    surveyPolygon,
    zone.wkid,
  );

  return {
    isValid: true,
    boundsCheck,
    zone,
    projectedArea,
    reprojectedLayers,
    statistics,
    ideaValidation,
    planValidation,
    rawStreetFeatures,
    designWarnings: designValidation.warnings || [], //^ Include any warnings from design validation
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

  //^ Validate Design Concept Rules
  const designValidation = templates.requiredValidationsForDesignConcept(
    reprojectedLayers,
    DESIGN_CONCEPT_RULES,
  );
  if (!designValidation.isValid) {
    return {
      isValid: false,
      designValidationError: designValidation,
    };
  }

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
  const { planValidation, rawStreetFeatures } = await processPlanValidation(
    surveyPolygon,
    zone.wkid,
  );

  return {
    isValid: true,
    boundsCheck,
    zone,
    projectedArea,
    reprojectedLayers,
    statistics,
    ideaValidation,
    planValidation,
    rawStreetFeatures,
    designWarnings: designValidation.warnings || [], //^ Include any warnings from design validation
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

//^ ----------------- Draw Design Warnings -----------------
export async function drawDesignWarnings(view, designWarnings) {
  if (!view || !designWarnings || designWarnings.length === 0) return;

  let combinedExtent = null;

  for (const warn of designWarnings) {
    if (warn.polygon) {
      await templates.drawPolygon(view, warn.polygon, {
        title: `تداخل مكاني - ${warn.layerName}`,
        fillColor: [255, 0, 0, 0.55],
        outlineColor: [255, 0, 0, 1],
        outlineStyle: "solid",
        outlineWidth: 2.5,
        skipZoom: true,
      });

      if (warn.polygon.extent) {
        combinedExtent = combinedExtent
          ? combinedExtent.union(warn.polygon.extent)
          : warn.polygon.extent.clone();
      }
    }
  }

  if (combinedExtent) {
    await view.goTo(combinedExtent.expand(1.6), {
      animate: true,
      easing: "ease-in-out",
      duration: 1200,
    });
  }
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

export async function getParcelDetails(
  mapPoint,
  reprojectedLayers,
  cachedStreetFeatures,
) {
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

  //^ Nearest Street
  const nearestStreet = templates.findNearestStreet(
    selectedFeature.geometryUTM,
    cachedStreetFeatures,
  );

  const finalAttributes = {
    ...attributes,
    hasParcelLineLessThan15M: hasParcelLineLessThan15M,
    DistrictName: districtName,
    NearestStreetName: nearestStreet ? nearestStreet.streetName : "غير محدد",
    NearestStreetDistance: nearestStreet
      ? `${nearestStreet.distance} م`
      : "0 م",
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
