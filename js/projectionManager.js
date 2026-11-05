function extractFirstXCoordinate(geoJsonGeometry) {
  const coordinates = geoJsonGeometry.coordinates;
  const geometryType = geoJsonGeometry.type;

  if (geometryType === "Point") return coordinates[0];
  if (geometryType === "LineString" || geometryType === "MultiPoint")
    return coordinates[0]?.[0];
  if (geometryType === "Polygon" || geometryType === "MultiLineString")
    return coordinates[0]?.[0]?.[0];
  if (geometryType === "MultiPolygon") return coordinates[0]?.[0]?.[0]?.[0];

  return null;
}
export function identifyCoordinateSystem(sampleXCoordinate) {
  const isLargeCoordinate =
    sampleXCoordinate != null && Math.abs(sampleXCoordinate) > 180;
  return {
    kind: isLargeCoordinate ? "projected" : "geographic",
    wkid: isLargeCoordinate ? null : 4326,
    assumed: true,
  };
}

function convertGeoJsonToGeometry(
  geoJsonGeometry,
  spatialReference,
  Polygon,
  Polyline,
  Point,
) {
  const { type: geometryType, coordinates } = geoJsonGeometry;

  if (geometryType === "Point") {
    return new Point({
      x: coordinates[0],
      y: coordinates[1],
      spatialReference,
    });
  }

  if (geometryType === "LineString") {
    return new Polyline({ paths: [coordinates], spatialReference });
  }

  if (geometryType === "MultiLineString") {
    return new Polyline({ paths: coordinates, spatialReference });
  }

  if (geometryType === "Polygon") {
    return new Polygon({
      rings: coordinates,
      spatialReference,
    });
  }

  if (geometryType === "MultiPolygon") {
    return new Polygon({
      rings: coordinates.flat(1),
      spatialReference,
    });
  }

  return null;
}

function convertGeometryToGeoJsonCoords(projectedGeometry, geometryType) {
  if (geometryType === "Point")
    return [projectedGeometry.x, projectedGeometry.y];
  if (geometryType === "LineString") return projectedGeometry.paths[0];
  if (geometryType === "MultiLineString") return projectedGeometry.paths;
  if (geometryType === "Polygon") return projectedGeometry.rings;
  if (geometryType === "MultiPolygon")
    return projectedGeometry.rings.map((ring) => [ring]);
  return null;
}

function reprojectLayerFeatures(
  layerData,
  sourceSpatialReference,
  targetSpatialReference,
  projectionEngine,
  Polygon,
  Polyline,
  Point,
) {
  const reprojectedFeatures = layerData.features.map((feature) => {
    if (!feature.geometry) return feature;

    const geometry = convertGeoJsonToGeometry(
      feature.geometry,
      sourceSpatialReference,
      Polygon,
      Polyline,
      Point,
    );
    if (!geometry) return feature;

    const projectedGeometry = projectionEngine.project(
      geometry,
      targetSpatialReference,
    );
    if (!projectedGeometry) return feature;

    const newGeoJsonCoords = convertGeometryToGeoJsonCoords(
      projectedGeometry,
      feature.geometry.type,
    );
    if (!newGeoJsonCoords) return feature;

    return {
      ...feature,
      geometry: { ...feature.geometry, coordinates: newGeoJsonCoords },
    };
  });

  return { ...layerData, features: reprojectedFeatures };
}

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
    const sampleXCoordinate = firstGeometry
      ? extractFirstXCoordinate(firstGeometry)
      : null;
    const coordinateSystem = identifyCoordinateSystem(sampleXCoordinate);

    const sourceSpatialReference = coordinateSystem.wkid
      ? new SpatialReference({ wkid: coordinateSystem.wkid })
      : new SpatialReference({ wkt: layer.prj ?? "" });

    let geographicLayer, metricLayer;

    if (coordinateSystem.kind === "geographic") {
      geographicLayer = layer;
      metricLayer = reprojectLayerFeatures(
        layer,
        sourceSpatialReference,
        targetMetricSpatialReference,
        projectionEngine,
        Polygon,
        Polyline,
        Point,
      );
    } else if (coordinateSystem.wkid === targetMetricWkid) {
      metricLayer = layer;
      geographicLayer = reprojectLayerFeatures(
        layer,
        sourceSpatialReference,
        wgs84SpatialReference,
        projectionEngine,
        Polygon,
        Polyline,
        Point,
      );
    } else {
      geographicLayer = reprojectLayerFeatures(
        layer,
        sourceSpatialReference,
        wgs84SpatialReference,
        projectionEngine,
        Polygon,
        Polyline,
        Point,
      );
      metricLayer = reprojectLayerFeatures(
        geographicLayer,
        wgs84SpatialReference,
        targetMetricSpatialReference,
        projectionEngine,
        Polygon,
        Polyline,
        Point,
      );
    }
    geographicLayers.push(geographicLayer);
    metricLayers.push(metricLayer);
  }
  return { geoLayers: geographicLayers, metricLayers: metricLayers };
}

export function buildGeomGeo(geoJsonGeometry, Polygon, Polyline, Point) {
  return convertGeoJsonToGeometry(
    geoJsonGeometry,
    { wkid: 4326 },
    Polygon,
    Polyline,
    Point,
  );
}

export function buildGeomMetric(
  geoJsonGeometry,
  targetMetricWkid,
  Polygon,
  Polyline,
  Point,
) {
  return convertGeoJsonToGeometry(
    geoJsonGeometry,
    { wkid: targetMetricWkid },
    Polygon,
    Polyline,
    Point,
  );
}
