import { getEsriModules } from "./esriLibrary.js";

//* Template: build Local Layer
export function buildLocalLayer(featureCollection, fieldsDef) {
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
