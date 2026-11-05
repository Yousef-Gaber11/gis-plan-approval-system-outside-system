import { getLandUseName, toNum, round2, findLayer } from "./helperFun.js";

export function calcStatistics(layers) {
  const survey = findLayer(layers, "SurveyS");
  const parcels = findLayer(layers, "ParcelsPolygonS");
  const streets = findLayer(layers, "PlansStreetsPlygonsS");
  const parking = findLayer(layers, "PlansCarParkingS");
  const lakes = findLayer(layers, "PlansLakesS");

  const statistics = {
    planArea: toNum(survey?.features?.[0]?.properties?.Area),
    landuseInfo: {},
    parcelsListInfo: [],
    PlansStreetsPlygonsS: { area: 0, areaPercentage: 0 },
    PlansCarParkingS: { area: 0, areaPercentage: 0 },
    PlansLakesS: { area: 0, areaPercentage: 0 },
  };

  for (const feature of parcels?.features ?? []) {
    const p = feature.properties;
    const name = getLandUseName(p.USECODE ?? "");
    const area = toNum(p.Area);

    statistics.parcelsListInfo.push({
      parcelNo: String(p.PARCELNO ?? "N/A"),
      area,
      landUse: name,
    });
    const code = p.USECODE ?? "";
    const info = (statistics.landuseInfo[name] ??= {
      landuse: code,
      count: 0,
      area: 0,
      areaPercentage: 0,
    });
    info.count += 1;
    info.area += area;
  }

  const sumArea = (layer) =>
    (layer?.features ?? []).reduce((s, f) => s + toNum(f.properties.Area), 0);

  statistics.PlansStreetsPlygonsS.area = sumArea(streets);
  statistics.PlansCarParkingS.area = sumArea(parking);
  statistics.PlansLakesS.area = sumArea(lakes);

  const pct = (a) =>
    statistics.planArea > 0 ? round2((a / statistics.planArea) * 100) : 0;

  for (const info of Object.values(statistics.landuseInfo)) {
    info.area = round2(info.area);
    info.areaPercentage = pct(info.area);
  }
  for (const k of ["PlansStreetsPlygonsS", "PlansCarParkingS", "PlansLakesS"]) {
    statistics[k].area = round2(statistics[k].area);
    statistics[k].areaPercentage = pct(statistics[k].area);
  }
  return statistics;
}

//* ===== JSON viewer =====
export function renderJson(statistics) {
  jsonViewer.innerHTML = "";
  jsonViewer.classList.remove("waiting");
  const formatter = new JSONFormatter({ statistics }, 3, {
    hoverPreviewEnabled: false,
    theme: "light",
  });
  jsonViewer.appendChild(formatter.render());
}
