let esriModules = null;

export function loadEsriModules() {
  return new Promise((resolve, reject) => {
    if (esriModules) {
      return resolve(esriModules);
    }

    require([
      "esri/Map",
      "esri/views/MapView",
      "esri/layers/GeoJSONLayer",
      "esri/widgets/LayerList",
      "esri/widgets/Expand",
      "esri/geometry/geometryEngine",
      "esri/geometry/Polygon",
      "esri/geometry/projection",
      "esri/geometry/SpatialReference",
      "esri/Graphic",
      "esri/rest/support/Query",
      "esri/layers/FeatureLayer",
      "esri/geometry/Polyline",
      "esri/geometry/Point",
      "esri/layers/GraphicsLayer",
    ], function (
      Map,
      MapView,
      GeoJSONLayer,
      LayerList,
      Expand,
      geometryEngine,
      Polygon,
      projection,
      SpatialReference,
      Graphic,
      Query,
      FeatureLayer,
      Polyline,
      Point,
      GraphicsLayer,
    ) {
      try {
        esriModules = {
          Map,
          MapView,
          GeoJSONLayer,
          LayerList,
          Expand,
          geometryEngine,
          Polygon,
          projection,
          SpatialReference,
          Graphic,
          Query,
          FeatureLayer,
          Polyline,
          Point,
          GraphicsLayer,
        };
        resolve(esriModules);
      } catch (err) {
        reject(err);
      }
    });
  });
}

export function getEsriModules() {
  if (!esriModules) {
    throw new Error(
      "لم يتم تحميل المكتبات",
    );
  }
  return esriModules;
}
