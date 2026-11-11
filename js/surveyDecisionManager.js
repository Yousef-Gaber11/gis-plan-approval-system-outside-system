import { fetchSurveyDecisionData } from "./queriesService.js";
import { drawContextPolygon } from "./graphicRenderer.js";
import {
  buildLocalZoneLayer,
  queryIntersectingZones,
  calculateMaxZoneArea,
  formatZoneOutput,
} from "./zoneProcessor.js";

export async function surveyDecisionManager(
  krokino,
  view,
) {
  //* Query Survey Decision Data
  const decisionFeature = await fetchSurveyDecisionData(krokino);
  const decisionPolygon = decisionFeature.geometry;
  const attrs = decisionFeature.attributes;

  //* Build Local Zone Layer
  const localZoneLayer = buildLocalZoneLayer();
  //* Query Intersecting Zones
  const intersectingZones = await queryIntersectingZones(
    decisionPolygon,
    localZoneLayer,
  );
  //* Calculate Max Zone Area
  const bestZoneRaw = calculateMaxZoneArea(
    intersectingZones,
    decisionPolygon,
  );
  //* Format Zone Output
  const finalZone = formatZoneOutput(bestZoneRaw);

  if (!finalZone) {
    throw new Error(
      "تعذر استنتاج الزون، القرار المساحي قد يقع خارج النطاقات المعتمدة.",
    );
  }

  console.log(
    `[Zone Success] Zone Number: ${finalZone.number} | WKID: ${finalZone.wkid}`,
  );

  const surveyContext = {
    type: "decision",
    code: krokino,
    name: `القرار المساحي: ${krokino}`,
    landArea: attrs.LANDAREA || 0,
    polygon: decisionPolygon,
    zone: finalZone,
    attributes: attrs,
  };

  //* Draw
  const surveyLayer = await drawContextPolygon(
    view,
    surveyContext.polygon,
    "decision",
    "حدود القرار المساحي",
  );

  return { context: surveyContext, layer: surveyLayer };
}
