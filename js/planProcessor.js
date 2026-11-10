import { findLayer } from "./helperFun.js";
import { reprojectAllLayers } from "./projectionManager.js";
import {
  checkContextBoundary,
  calculateProjectedArea,
} from "./spatialValidation.js";

export async function processPlanValidation(
  rawLayers,
  activeContext,
  SpatialReference,
  projection,
  Polygon,
  Polyline,
  Point,
) {
  const zone = activeContext.zone;
  const contextType = activeContext.type || "municipality";

  if (!zone?.wkid) {
    throw new Error(
      "بيانات النطاق الأساسي لا تحتوي على نطاق إحداثيات متري (ZONE) صالح من السيرفر.",
    );
  }

  const { geoLayers, metricLayers } = await reprojectAllLayers(
    rawLayers,
    zone.wkid,
    SpatialReference,
    projection,
    Polygon,
    Polyline,
    Point,
  );

  //* ==============
  //* Decision Path
  //* ==============
  if (contextType === "decision") {
    console.log(
      "%c=== تقرير فحص طبقات الشيب فايل مع القرار المساحي ===",
      "color: #0088cc; font-weight: bold; font-size: 13px;",
    );

    let globalHasInsideOrPartial = false;
    let globalHasOutside = false;

    for (const layer of geoLayers) {
      if (!layer.features) continue;

      let layerInsideOrPartialCount = 0;
      let layerOutsideCount = 0;

      for (const feature of layer.features) {
        if (!feature.esriGeometry) continue;

        const statusCheck = checkContextBoundary(
          feature.esriGeometry,
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

      if (layerInsideOrPartialCount > 0 && layerOutsideCount === 0) {
        console.log(
          `%c${layer.fileName}: داخل القرار (${layerInsideOrPartialCount})`,
          "color: green;",
        );
      } else if (layerInsideOrPartialCount === 0 && layerOutsideCount > 0) {
        console.log(
          `%c${layer.fileName}: خارج القرار! (${layerOutsideCount})`,
          "color: red;",
        );
      } else if (layerInsideOrPartialCount > 0 && layerOutsideCount > 0) {
        console.log(
          `%c${layer.fileName}: جزئي (جوه: ${layerInsideOrPartialCount}, بره: ${layerOutsideCount})`,
          "color: orange;",
        );
      } else {
        console.log(
          `[Layer] ${layer.fileName}: لا تحتوي على عناصر صالحة للفحص.`,
        );
      }
    }
    if (globalHasOutside) {
      console.log(
        "%المخطط يحتوي على بعض العناصر التي تقع خارج حدود القرار :[Summary]",
        "color: orange; font-weight: bold;",
      );
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
      return { isValid: false, boundsCheck, zone, geoLayers, metricLayers };
    }

    const projectedArea =
      activeContext.landArea || activeContext.attributes?.LANDAREA || 0;

    return {
      isValid: true,
      boundsCheck,
      zone,
      projectedArea,
      geoLayers,
      metricLayers,
    };
  }

  //* ====================
  //* (Municipality Path)
  //* =================
  const surveyLayerGeo = findLayer(geoLayers, "SurveyS");
  if (!surveyLayerGeo?.features?.[0]?.esriGeometry) {
    throw new Error("لم يتم العثور على طبقة SurveyS في الملف المرفوع.");
  }

  const boundsCheck = checkContextBoundary(
    surveyLayerGeo.features[0].esriGeometry,
    activeContext.polygon,
    "municipality",
  );

  if (boundsCheck.status === "outside") {
    return { isValid: false, boundsCheck, zone, geoLayers, metricLayers };
  }

  const surveyMetric = findLayer(metricLayers, "SurveyS");
  const projectedArea = Math.abs(
    calculateProjectedArea(surveyMetric.features[0].esriGeometry),
  );

  return {
    isValid: true,
    boundsCheck,
    zone,
    projectedArea,
    geoLayers,
    metricLayers,
  };
}
