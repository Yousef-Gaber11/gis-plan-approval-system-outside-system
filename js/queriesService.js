//* MUNICIPALITYUNIQUECODE (Default)
export const MUNICIPALITY_CODE = "011001001";

const MUNI_SERVICE_URL =
  "https://gisstg229.momah.gov.sa/server/rest/services/Test/BasicMap/MapServer/4";
const SURVEY_DECISION_URL =
  "https://gisstg229.momah.gov.sa/server/rest/services/Test/EditLayers/mapServer/2";

//* Template for executing a base query
async function executeBaseQuery(
  url,
  whereClause,
  outFields,
  FeatureLayer,
  errorMsg,
) {
  const layer = new FeatureLayer({ url });
  const result = await layer.queryFeatures({
    where: whereClause,
    outFields,
    returnGeometry: true,
  });

  if (!result.features || result.features.length === 0) {
    throw new Error(errorMsg);
  }
  return result.features[0];
}

//* Query Municipality Data
export function fetchMunicipalityData(code, FeatureLayer) {
  return executeBaseQuery(
    MUNI_SERVICE_URL,
    `MUNICIPALITYUNIQUECODE = '${code}'`,
    ["MUNICIPALITYARNAME", "AMANA", "ZONE"],
    FeatureLayer,
    `لم يتم العثور على بيانات البلدية بالكود: ${code}`,
  );
}

//* Query Survey Decision Data
export function fetchSurveyDecisionData(krokino, FeatureLayer) {
  return executeBaseQuery(
    SURVEY_DECISION_URL,
    `KROKINO = '${krokino}' and KROKITYPE='7018' and ISAPPROVED = 1`,
    ["KROKINO", "LANDAREA"],
    FeatureLayer,
    `لم يتم العثور على قرار مساحي معتمد مطابق للرقم: ${krokino}`,
  );
}
