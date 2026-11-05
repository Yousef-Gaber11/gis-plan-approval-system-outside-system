import { layersDictionary } from "./layersConfig.js";

function createMapLayer(geoJson, renderer, labelClass, title, GeoJSONLayer) {
  const blob = new Blob([JSON.stringify(geoJson)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const layer = new GeoJSONLayer({
    url,
    renderer,
    title: title,
    labelingInfo: labelClass ? [labelClass] : [],
  });
  const release = () => URL.revokeObjectURL(url);
  layer.when(release, release);
  return layer;
}

export async function drawLayers(geoLayers, view, GeoJSONLayer) {
  const map = view.map;
  let overallExtent = null;

  for (const layerData of geoLayers) {
    const layerName = (layerData.fileName || "").split("/").pop().toLowerCase();
    const config = layersDictionary[layerName];

    if (!config) {
      console.warn(`الطبقة ${layerName} ليس لها إعدادات في الكتالوج.`);
      continue;
    }

    const hasGeometry = (layerData.features || []).some(
      (f) => f.geometry !== null,
    );
    if (!hasGeometry) {
      console.warn(
        `تم تخطي الطبقة ${layerName} لأنها لا تحتوي على بيانات هندسية.`,
      );
      continue;
    }

    const mapLayer = createMapLayer(
      layerData,
      config.renderer,
      config.labelClass || null,
      config.title,
      GeoJSONLayer,
    );
    map.add(mapLayer);

    try {
      await mapLayer.when();
      const ext = mapLayer.fullExtent;
      if (ext)
        overallExtent = overallExtent ? overallExtent.union(ext) : ext.clone();
    } catch (err) {
      console.warn(`فشل حساب نطاق الطبقة ${layerName}`, err);
    }
  }

  if (overallExtent) {
    try {
      await view.when();
      await view.goTo(overallExtent.expand(1.2), {
        animate: true,
        duration: 1000,
        easing: "ease-in-out",
      });
    } catch (err) {
      console.error("خطأ أثناء تحريك الزووم", err);
    }
  }
}
