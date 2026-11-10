//* checkGeographic
function checkGeographic(geometry) {
  if (!geometry) return false;

  let point = geometry.coordinates
    ? Array.isArray(geometry.coordinates[0][0])
      ? geometry.coordinates[0][0]
      : geometry.coordinates[0]
    : geometry;

  return point && point[0] != null
    ? Math.abs(point[0]).toString().split(".")[0].length <= 2
    : false;
}

//* createAndReprojectLayer
function createAndReprojectLayer(
  layerData,
  sourceSpatialReference,
  targetSpatialReference,
  projectionEngine,
  Polygon,
  Polyline,
  Point,
) {
  const processedFeatures = layerData.features.map((feature) => {
    if (!feature.geometry) return feature;

    const { type: geoType, coordinates } = feature.geometry;
    let esriGeometry = null;

    try {
      if (geoType === "Point") {
        esriGeometry = new Point({
          x: coordinates[0],
          y: coordinates[1],
          spatialReference: sourceSpatialReference,
        });
      } else if (geoType === "LineString") {
        esriGeometry = new Polyline({
          paths: [coordinates],
          spatialReference: sourceSpatialReference,
        });
      } else if (geoType === "MultiLineString") {
        esriGeometry = new Polyline({
          paths: coordinates,
          spatialReference: sourceSpatialReference,
        });
      } else if (geoType === "Polygon") {
        esriGeometry = new Polygon({
          rings: coordinates,
          spatialReference: sourceSpatialReference,
        });
      } else if (geoType === "MultiPolygon") {
        esriGeometry = new Polygon({
          rings: coordinates.flat(1),
          spatialReference: sourceSpatialReference,
        });
      }
    } catch (err) {
      console.warn("خطأ في بناء الشكل الهندسي:", err);
      return feature;
    }

    if (!esriGeometry) return feature;

    let finalGeometry = esriGeometry;
    if (sourceSpatialReference.wkid !== targetSpatialReference.wkid) {
      finalGeometry = projectionEngine.project(
        esriGeometry,
        targetSpatialReference,
      );
    }

    let newCoords;
    if (geoType === "Point") newCoords = [finalGeometry.x, finalGeometry.y];
    else if (geoType === "LineString") newCoords = finalGeometry.paths[0];
    else if (geoType === "MultiLineString") newCoords = finalGeometry.paths;
    else if (geoType === "Polygon") newCoords = finalGeometry.rings;
    else if (geoType === "MultiPolygon")
      newCoords = finalGeometry.rings.map((r) => [r]);

    const newFeature = {
      ...feature,
      geometry: { type: geoType, coordinates: newCoords },
    };

    Object.defineProperty(newFeature, "esriGeometry", {
      value: finalGeometry,
    });

    return newFeature;
  });

  return { ...layerData, features: processedFeatures };
}

//* reprojectAllLayers
export async function reprojectAllLayers(
  rawLayers,
  targetMetricWkid,
  SpatialReference,
  projectionEngine,
  Polygon,
  Polyline,
  Point,
) {
  if (!projectionEngine.isLoaded()) await projectionEngine.load();

  const wgs84SpatialReference = new SpatialReference({ wkid: 4326 });
  const targetMetricSpatialReference = new SpatialReference({
    wkid: targetMetricWkid,
  });

  const geographicLayers = [];
  const metricLayers = [];

  for (const layer of rawLayers) {
    const firstGeometry = layer.features?.find(
      (feature) => feature.geometry,
    )?.geometry;

    const isGeographic = checkGeographic(firstGeometry);
    const sourceWkid = isGeographic ? 4326 : null;

    const sourceSpatialReference = sourceWkid
      ? new SpatialReference({ wkid: sourceWkid })
      : new SpatialReference({ wkt: layer.prj ?? "" });

    const geographicLayer = createAndReprojectLayer(
      layer,
      sourceSpatialReference,
      wgs84SpatialReference,
      projectionEngine,
      Polygon,
      Polyline,
      Point,
    );

    const metricLayer = createAndReprojectLayer(
      layer,
      sourceSpatialReference,
      targetMetricSpatialReference,
      projectionEngine,
      Polygon,
      Polyline,
      Point,
    );

    geographicLayers.push(geographicLayer);
    metricLayers.push(metricLayer);
  }

  return { geoLayers: geographicLayers, metricLayers: metricLayers };
}
