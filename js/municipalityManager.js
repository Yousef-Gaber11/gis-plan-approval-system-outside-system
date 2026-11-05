import { municipalityService, MUNICIPALITY_CODE } from "./municipalityService.js";

export async function municipalityManager(
  view,
  GraphicsLayer,
  Graphic,
  FeatureLayer,
  validationViewer,
) {
  let municipalityContext = null;
  let muniLayer = null;
  try {
    if (validationViewer) {
      validationViewer.textContent =
        "جاري الاتصال بالسيرفر لجلب نطاق البلدية...";
    }

    municipalityContext = await municipalityService(
      MUNICIPALITY_CODE,
      FeatureLayer,
    );

    muniLayer = new GraphicsLayer({ title: "حدود البلدية" });
    const muniGraphic = new Graphic({
      geometry: municipalityContext.polygon,
      symbol: {
        type: "simple-fill",
        color: [255, 100, 0, 0.2],
        outline: { color: [255, 69, 0, 0.9], width: 2.5, style: "dash" },
      },
      attributes: { Name: "حدود البلدية" },
    });
    muniLayer.add(muniGraphic);
    view.map.add(muniLayer, 0);

    if (validationViewer) {
      validationViewer.innerHTML = `<span style="color:green;">تم تحميل نطاق (<b>${municipalityContext.name}</b>) - في انتظار رفع المخطط...</span>`;
    }

    await view.when();
    await view.goTo(municipalityContext.polygon.extent.expand(1.3), {
      animate: true,
      easing: "linear",
      duration: 1200,
    });

    return { context: municipalityContext, layer: muniLayer };
  } catch (err) {
    console.error("فشل تحميل البلدية:", err);
    if (validationViewer) {
      validationViewer.innerHTML = `<span style="color:red;">خطأ في تحميل بيانات البلدية: ${err.message}</span>`;
    }
    return { context: null, layer: null };
  }
}
