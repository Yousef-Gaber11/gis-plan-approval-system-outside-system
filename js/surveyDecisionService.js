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
    outFields: ["KROKINO", "LANDAREA"],
    returnGeometry: true,
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
    landArea: decisionFeature.attributes.LANDAREA || 0,
    polygon: decisionPolygon,
    zone: {
      number: zoneResult.number,
      wkid: zoneResult.wkid,
    },
    attributes: decisionFeature.attributes,
  };
}
