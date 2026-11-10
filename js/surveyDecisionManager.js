import { surveyDecisionService } from "./surveyDecisionService.js";

export async function surveyDecisionManager(
  krokino,
  view,
  GraphicsLayer,
  Graphic,
  FeatureLayer,
  geometryEngine,
  validationViewer,
  Polygon,
) {
  let surveyContext = null;
  let surveyLayer = null;

  try {
    if (validationViewer) {
      validationViewer.textContent =
        "جاري الاتصال بالسيرفر لجلب القرار المساحي واستنتاج الزون...";
    }

    //^ fetch the survey decision and zone
    surveyContext = await surveyDecisionService(
      krokino,
      FeatureLayer,
      geometryEngine,
      Polygon,
      Graphic,
    );

    //^ draw
    surveyLayer = new GraphicsLayer({ title: "حدود القرار المساحي" });
    const decisionGraphic = new Graphic({
      geometry: surveyContext.polygon,
      symbol: {
        type: "simple-fill",
        color: [0, 150, 255, 0.2],
        outline: { color: [0, 100, 255, 0.9], width: 2.5, style: "dash" },
      },
      attributes: { Name: surveyContext.name },
    });

    surveyLayer.add(decisionGraphic);
    view.map.add(surveyLayer, 0);

    if (validationViewer) {
      validationViewer.innerHTML = `<span style="color:green;">تم تحميل (${surveyContext.name}) - النطاق المستنتج: <b>Zone ${surveyContext.zone.number}</b> - في انتظار رفع المخطط...</span>`;
    }

    //^ zoom
    await view.when();
    await view.goTo(surveyContext.polygon.extent.expand(1.3), {
      animate: true,
      easing: "linear",
      duration: 1200,
    });

    return { context: surveyContext, layer: surveyLayer };
  } catch (err) {
    console.error("فشل تحميل القرار المساحي:", err);
    if (validationViewer) {
      validationViewer.innerHTML = `<span style="color:red;">خطأ: ${err.message}</span>`;
    }
    return { context: null, layer: null };
  }
}
