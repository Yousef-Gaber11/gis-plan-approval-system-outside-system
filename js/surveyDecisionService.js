import { detectZoneWithFallback } from "./zoneDetectorService.js";

const SURVEY_DECISION_URL =
  "https://gisstg229.momah.gov.sa/server/rest/services/Test/EditLayers/mapServer/2";

export async function surveyDecisionService(
  krokino,
  FeatureLayer,
  geometryEngine,
  Polygon,
  Graphic,
) {
  //^ Query
  const decisionLayer = new FeatureLayer({ url: SURVEY_DECISION_URL });
  const whereClause = `KROKINO = '43013394328' and KROKITYPE='7018' and ISAPPROVED = 1`; //KROKINO= '43013394328','${krokino}'
  const decisionResult = await decisionLayer.queryFeatures({
    where: whereClause,
    // outFields: ["KROKINO", "LICENSEID"],
    returnGeometry: true,
    // outSpatialReference: { wkid: 4326 },
  });

  if (!decisionResult.features || decisionResult.features.length === 0) {
    throw new Error(
      `لم يتم العثور على قرار مساحي معتمد مطابق للرقم: ${krokino}`,
    );
  }

  const decisionFeature = decisionResult.features[0];
  const decisionPolygon = decisionFeature.geometry;

  //^ zone
  const zoneResult = await detectZoneWithFallback(
    decisionPolygon,
    FeatureLayer,
    geometryEngine,
    Polygon,
    Graphic,
  );

  return {
    type: "decision",
    code: krokino,
    name: `القرار المساحي: ${krokino}`,
    polygon: decisionPolygon,
    zone: {
      number: zoneResult.number,
      wkid: zoneResult.wkid,
    },
    attributes: decisionFeature.attributes,
  };
}
