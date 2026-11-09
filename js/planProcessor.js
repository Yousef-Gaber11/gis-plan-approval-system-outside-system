import { findLayer } from "./helperFun.js";
import {
  reprojectAllLayers,
  buildGeomGeo,
  buildGeomMetric,
} from "./projectionManager.js";
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
  //* (Decision Path
  //* ==============
  if (contextType === "decision") {
    console.log(
      "%c=== تقرير فحص طبقات الشيب فايل مع القرار المساحي ===",
      "color: #0088cc; font-weight: bold; font-size: 13px;",
    );

    let globalHasInside = false;
    let globalHasOutsideOrPartial = false;

    for (const layer of geoLayers) {
      if (!layer.features) continue;

      let layerInsideCount = 0;
      let layerOutsideOrPartialCount = 0;

      for (const feature of layer.features) {
        if (!feature.geometry) continue;

        const featGeom = buildGeomGeo(
          feature.geometry,
          Polygon,
          Polyline,
          Point,
        );
        const statusCheck = checkContextBoundary(
          featGeom,
          activeContext.polygon,
          "decision",
        );

        if (statusCheck.status === "inside") {
          layerInsideCount++;
          globalHasInside = true;
        } else {
          layerOutsideOrPartialCount++;
          globalHasOutsideOrPartial = true;
        }
      }

      if (layerInsideCount > 0 && layerOutsideOrPartialCount === 0) {
        console.log(
          `%c[Layer] ${layer.fileName}: بالكامل داخل القرار المساحي (عناصر: ${layerInsideCount})`,
          "color: green;",
        );
      } else if (layerInsideCount === 0 && layerOutsideOrPartialCount > 0) {
        console.log(
          `%c[Layer] ${layer.fileName}: بالكامل خارج القرار المساحي (عناصر: ${layerOutsideOrPartialCount})`,
          "color: red;",
        );
      } else if (layerInsideCount > 0 && layerOutsideOrPartialCount > 0) {
        console.log(
          `%c[Layer] ${layer.fileName}: متقاطعة جزئيا (بالداخل: ${layerInsideCount}, بالخارج: ${layerOutsideOrPartialCount})`,
          "color: orange;",
        );
      } else {
        console.log(
          `[Layer] ${layer.fileName}: لا تحتوي على عناصر صالحة للفحص.`,
        );
      }
    }

    let finalStatus = "";
    let finalMessage = "";
    let isValid = true;

    if (!globalHasInside) {
      finalStatus = "outside";
      finalMessage =
        "جميع طبقات المخطط تقع بالكامل خارج القرار المساحي المعتمد";
      isValid = false;
    } else if (globalHasOutsideOrPartial) {
      finalStatus = "partial";
      finalMessage =
        "المخطط متقاطع أو يقع جزئيا خارج حدود القرار المساحي";
      isValid = true;
    } else {
      finalStatus = "inside";
      finalMessage = "جميع طبقات المخطط تقع بالكامل داخل حدود القرار المساحي";
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
  if (!surveyLayerGeo?.features?.[0]?.geometry) {
    throw new Error("لم يتم العثور على طبقة SurveyS في الملف المرفوع.");
  }

  const surveyGeomGeo = buildGeomGeo(
    surveyLayerGeo.features[0].geometry,
    Polygon,
    Polyline,
    Point,
  );

  const boundsCheck = checkContextBoundary(
    surveyGeomGeo,
    activeContext.polygon,
    "municipality",
  );

  if (boundsCheck.status === "outside") {
    return { isValid: false, boundsCheck, zone, geoLayers, metricLayers };
  }

  const surveyMetric = findLayer(metricLayers, "SurveyS");
  const surveyGeomMetric = buildGeomMetric(
    surveyMetric.features[0].geometry,
    zone.wkid,
    Polygon,
    Polyline,
    Point,
  );
  const projectedArea = Math.abs(calculateProjectedArea(surveyGeomMetric));

  return {
    isValid: true,
    boundsCheck,
    zone,
    projectedArea,
    geoLayers,
    metricLayers,
  };
}
