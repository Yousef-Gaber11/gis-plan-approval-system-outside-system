import { findLayer } from "./helperFun.js";
import {
  reprojectAllLayers,
  buildGeomGeo,
  buildGeomMetric,
} from "./projectionManager.js";
import {
  checkMunicipalityBoundary,
  calculateProjectedArea,
} from "./spatialValidation.js";

export async function processPlanValidation(
  rawLayers,
  municipalityContext,
  SpatialReference,
  projection,
  Polygon,
  Polyline,
  Point,
) {
  const zone = municipalityContext.zone;
  if (!zone?.wkid) {
    throw new Error(
      "بيانات البلدية لا تحتوي على نطاق إحداثيات متري (ZONE) صالح من السيرفر.",
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

  const surveyLayerGeo = findLayer(geoLayers, "SurveyS");
  if (!surveyLayerGeo?.features?.[0]?.geometry) {
    throw new Error("لم يتم العثور على طبقة SurveyS في الملف المرفوع.");
  }

  // * check municipality boundary
  const surveyGeomGeo = buildGeomGeo(
    surveyLayerGeo.features[0].geometry,
    Polygon,
    Polyline,
    Point,
  );
  const boundsCheck = checkMunicipalityBoundary(
    surveyGeomGeo,
    municipalityContext.polygon,
  );
  if (boundsCheck.status === "outside") {
    return { isValid: false, boundsCheck, zone, geoLayers, metricLayers };
  }

  //* detect municipality zone and calculate projected area
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
