import { getEsriModules } from "./esriLibrary.js";
import { zonesFeatureCollection } from "./zonesData.js";

//* Local Zone Layer Builder
export function buildLocalZoneLayer() {
  const { Polygon, Graphic, FeatureLayer } = getEsriModules();

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

  return new FeatureLayer({
    source: graphics,
    objectIdField: "OBJECTID",
    geometryType: "polygon",
    fields: [
      { name: "OBJECTID", type: "oid" },
      { name: "ZONE", type: "integer" },
    ],
    spatialReference: { wkid: 4326 },
  });
}

//* Query Intersecting Zones
export async function queryIntersectingZones(decisionPolygon, localLayer) {
  const result = await localLayer.queryFeatures({
    geometry: decisionPolygon,
    spatialRelationship: "intersects",
    outFields: ["ZONE"],
    returnGeometry: true,
  });

  return result.features || [];
}

//* Calculate Maximum Zone Area
export function calculateMaxZoneArea(intersectingFeatures, decisionPolygon) {
  const { geometryEngine } = getEsriModules();

  let bestZone = null;
  let maxArea = -1;

  for (const f of intersectingFeatures) {
    try {
      const hit = geometryEngine.intersect(f.geometry, decisionPolygon);
      if (!hit) continue;

      const area = Math.abs(geometryEngine.geodesicArea(hit, "square-meters"));

      if (area > maxArea) {
        maxArea = area;
        bestZone = f.attributes.ZONE;
      }
    } catch (e) {
      console.warn("تعذر حساب التقاطع مع الزون رقم", f.attributes.ZONE, e);
    }
  }

  return bestZone ? parseInt(bestZone, 10) : null;
}

//* Format Zone Output
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

  return {
    number: finalZoneNumber,
    wkid: finalWkid,
  };
}
