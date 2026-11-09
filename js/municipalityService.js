//* MUNICIPALITYUNIQUECODE
export const MUNICIPALITY_CODE = "011001001";

const SERVICE_URL =
  "https://gisstg229.momah.gov.sa/server/rest/services/Test/BasicMap/MapServer/4";

export async function municipalityService(code, FeatureLayer) {
  const layer = new FeatureLayer({ url: SERVICE_URL });

  const result = await layer.queryFeatures({
    where: `MUNICIPALITYUNIQUECODE = '${code}'`,
    outFields: ["MUNICIPALITYARNAME", "AMANA", "ZONE"],
    returnGeometry: true,
  });

  const feature = result.features[0];
  const attrs = feature.attributes;

  const zoneWkid = attrs.ZONE ? parseInt(attrs.ZONE, 10) : null;
  const zone = zoneWkid ? { number: zoneWkid - 32600, wkid: zoneWkid } : null;

  return {
    type: "municipality",
    code,
    name: attrs.MUNICIPALITYARNAME + " - " + attrs.AMANA ?? "",
    polygon: feature.geometry,
    zone,
    attributes: attrs,
  };
}
