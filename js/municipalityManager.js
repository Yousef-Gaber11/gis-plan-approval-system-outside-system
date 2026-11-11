import { fetchMunicipalityData, MUNICIPALITY_CODE } from "./queriesService.js";
import { drawContextPolygon } from "./graphicRenderer.js";
import { formatZoneOutput } from "./zoneProcessor.js";

export async function municipalityManager(view) {
  //* Query Municipality Data
  const feature = await fetchMunicipalityData(MUNICIPALITY_CODE);
  const attrs = feature.attributes;

  //* Format Zone
  const zone = formatZoneOutput(attrs.ZONE ? parseInt(attrs.ZONE, 10) : null);

  const municipalityContext = {
    type: "municipality",
    code: MUNICIPALITY_CODE,
    name:
      (attrs.MUNICIPALITYARNAME || "") +
      (attrs.AMANA ? " - " + attrs.AMANA : ""),
    polygon: feature.geometry,
    zone: zone,
    attributes: attrs,
  };

  //* Draw
  const muniLayer = await drawContextPolygon(
    view,
    municipalityContext.polygon,
    "municipality",
    "حدود البلدية",
  );

  return { context: municipalityContext, layer: muniLayer };
}
