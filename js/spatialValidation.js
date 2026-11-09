let geometryEngine = null;

export function initSpatialValidation(geEngine) {
  geometryEngine = geEngine;
}

//* checkContextBoundary for planExtent and contextPolygon("municipality" or "decision")
export function checkContextBoundary(planExtent, contextPolygon, contextType) {
  const isInside = geometryEngine.within(planExtent, contextPolygon);
  const isIntersecting = geometryEngine.intersects(planExtent, contextPolygon);

  const targetName = contextType === "decision" ? "القرار المساحي" : "البلدية";

  if (isInside) {
    return {
      status: "inside",
      message: `المخطط يقع بالكامل داخل حدود ${targetName}.`,
    };
  } else if (isIntersecting) {
    return {
      status: "partial",
      message: `المخطط يقع جزئياً خارج حدود ${targetName}.`,
    };
  } else {
    return {
      status: "outside",
      message: `المخطط يقع بالكامل خارج حدود ${targetName}!`,
    };
  }
}

// * fun calculate Area
export function calculateProjectedArea(metricGeometry) {
  return geometryEngine.planarArea(metricGeometry, "square-meters");
}
