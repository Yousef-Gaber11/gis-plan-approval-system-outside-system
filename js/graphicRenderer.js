import { getEsriModules } from "./esriLibrary.js";

export async function drawContextPolygon(view, polygon, contextType, title) {
  const { GraphicsLayer, Graphic } = getEsriModules();

  const layer = new GraphicsLayer({ title: title });

  let fillColor, outlineColor;

  if (contextType === "decision") {
    fillColor = [0, 150, 255, 0.2];
    outlineColor = [0, 100, 255, 0.9];
  } else {
    fillColor = [255, 100, 0, 0.2];
    outlineColor = [255, 69, 0, 0.9];
  }

  const graphic = new Graphic({
    geometry: polygon,
    symbol: {
      type: "simple-fill",
      color: fillColor,
      outline: { color: outlineColor, width: 2.5, style: "dash" },
    },
    attributes: { Name: title },
  });

  layer.add(graphic);
  view.map.add(layer, 0);

  await view.when();
  await view.goTo(polygon.extent.expand(1.3), {
    animate: true,
    easing: "linear",
    duration: 1200,
  });

  return layer;
}
