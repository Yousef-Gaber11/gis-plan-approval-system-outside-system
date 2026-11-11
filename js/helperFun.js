import { getEsriModules } from "./esriLibrary.js";
import { LAND_USE } from "./layersConfig.js";

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

//* Template: Calculate mx intersection area and return target field value(zone)
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
  return { number: finalZoneNumber, wkid: finalWkid };
}
