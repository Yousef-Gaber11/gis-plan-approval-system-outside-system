import { zonesFeatureCollection, municipalityFeature } from "./zonesData.js";

let geometryEngine = null;
let Polygon = null;
let projection = null;
let SpatialReference = null;
let Query = null;
let FeatureLayer = null;
let Graphic = null;

export function initSpatialValidation(
  geEngine,
  esriPolygon,
  proj,
  sr,
  esriQuery,
  esriFeatureLayer,
  esriGraphic,
) {
  geometryEngine = geEngine;
  Polygon = esriPolygon;
  projection = proj;
  SpatialReference = sr;
  Query = esriQuery;
  FeatureLayer = esriFeatureLayer;
  Graphic = esriGraphic;
}

// * fun detectMunicipalityZone  (أكبر مساحة تقاطع)
export async function detectMunicipalityZone(Poly) {
  const graphics = zonesFeatureCollection.features.map((feat, index) => {
    const polyGeom = new Polygon({
      rings: feat.geometry.rings,
      spatialReference: feat.geometry.spatialReference,
    });
    return new Graphic({
      geometry: polyGeom,
      attributes: {
        OBJECTID: feat.attributes.OBJECTID || index + 1,
        ZONE: feat.attributes.ZONE,
      },
    });
  });

  const zonesLayer = new FeatureLayer({
    source: graphics,
    objectIdField: "OBJECTID",
    geometryType: "polygon",
    fields: [
      { name: "OBJECTID", type: "oid" },
      { name: "ZONE", type: "integer" },
    ],
    spatialReference: { wkid: 4326 },
  });

  const query = new Query();
  query.geometry = Poly;
  query.spatialRelationship = "intersects";
  query.outFields = ["ZONE"];
  query.returnGeometry = true;

  try {
    const response = await zonesLayer.queryFeatures(query);
    const candidates = [];

    for (const f of response.features) {
      try {
        const hit = geometryEngine.intersect(f.geometry, Poly);
        if (!hit) continue;
        const area = Math.abs(
          geometryEngine.geodesicArea(hit, "square-meters"),
        );
        candidates.push({ number: f.attributes.ZONE, area });
      } catch (e) {
        console.warn("تعذر حساب التقاطع مع zone", f.attributes.ZONE, e);
      }
    }

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => b.area - a.area);
    const best = candidates[0];

    return {
      number: best.number,
      wkid: 32600 + best.number,
      candidates,
    };
  } catch (error) {
    console.error("خطأ في تحديد زون البلدية:", error);
    return null;
  }
}

// * fun surveyPoly intersects with municipalityFeature
export function checkMunicipalityBoundary(planExtent) {
  const Poly = new Polygon({
    rings: municipalityFeature.geometry.rings,
    spatialReference: municipalityFeature.geometry.spatialReference,
  });

  const isInside = geometryEngine.within(planExtent, Poly);
  const isIntersecting = geometryEngine.intersects(planExtent, Poly);

  if (isInside) {
    return {
      status: "inside",
      message: "المخطط يقع بالكامل داخل حدود البلدية.",
      polygon: Poly,
    };
  } else if (isIntersecting) {
    return {
      status: "partial",
      message: "المخطط يقع جزئياً خارج حدود البلدية.",
      polygon: Poly,
    };
  } else {
    return {
      status: "outside",
      message: "المخطط يقع بالكامل خارج حدود البلدية!",
      polygon: Poly,
    };
  }
}

// * fun calculate Area
export async function calculateProjectedArea(geometry, wkid) {
  if (!projection.isLoaded()) {
    await projection.load();
  }

  const outSpatialReference = new SpatialReference({ wkid: wkid });
  const projectedGeom = projection.project(geometry, outSpatialReference);

  const areaSqMeters = geometryEngine.planarArea(
    projectedGeom,
    "square-meters",
  );
  return areaSqMeters;
}
