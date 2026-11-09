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
  municipalityContext,
  SpatialReference,
  projection,
  Polygon,
  Polyline,
  Point,
) {
  const zone = municipalityContext.zone;
  const contextType = municipalityContext.type || "municipality";

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

  const BOUNDARY_NAMES = ["surveys", "approvedboundry", "parcelspolygons"];
  let surveyLayerGeo = null;
  for (const name of BOUNDARY_NAMES) {
    const found = findLayer(geoLayers, name);
    if (found?.features?.some((f) => f.geometry)) {
      surveyLayerGeo = found;
      break;
    }
  }
  const hasBoundaryInZip = !!surveyLayerGeo;

  if (!surveyLayerGeo) {
    surveyLayerGeo = geoLayers.find((l) =>
      l.features?.some(
        (f) =>
          f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon",
      ),
    );
  }
  if (!surveyLayerGeo) {
    throw new Error("الشيب فايل المرفوع لا يحتوي على أي طبقات صالحة للفحص!");
  }
  const validFeatureGeo = surveyLayerGeo.features.find((f) => f.geometry);

  const surveyGeomGeo = buildGeomGeo(
    validFeatureGeo.geometry,
    Polygon,
    Polyline,
    Point,
  );
  const boundsCheck = checkContextBoundary(
    surveyGeomGeo,
    municipalityContext.polygon,
    contextType,
  );
  if (boundsCheck.status === "outside") {
    return {
      isValid: false,
      boundsCheck,
      zone,
      geoLayers,
      metricLayers,
      hasBoundaryInZip,
    };
  }

  //^ area
  let projectedArea = 0;
  if (hasBoundaryInZip) {
    const surveyMetric = metricLayers.find(
      (l) => l.fileName === surveyLayerGeo.fileName,
    );
    const validFeatureMetric = surveyMetric.features.find((f) => f.geometry);
    const surveyGeomMetric = buildGeomMetric(
      validFeatureMetric.geometry,
      zone.wkid,
      Polygon,
      Polyline,
      Point,
    );
    projectedArea = Math.abs(calculateProjectedArea(surveyGeomMetric));
  } else {
    const contextGeomMetric = projection.project(municipalityContext.polygon, {
      wkid: zone.wkid,
    });
    projectedArea = Math.abs(calculateProjectedArea(contextGeomMetric));
  }

  return {
    isValid: true,
    boundsCheck,
    zone,
    projectedArea,
    geoLayers,
    metricLayers,
    hasBoundaryInZip,
  };
}
