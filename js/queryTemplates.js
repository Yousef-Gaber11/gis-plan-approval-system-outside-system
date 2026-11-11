import { getEsriModules } from "./esriLibrary.js";

//* Template: Execute base query using URL and WHERE clause
export async function executeBaseQuery(url, whereClause, outFields, errorMsg) {
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

//* 2. Template: Spatial intersect query for any layer with any geometry
export async function executeIntersectQuery(
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
