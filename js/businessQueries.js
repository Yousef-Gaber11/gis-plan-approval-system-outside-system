import { executeBaseQuery } from "./queryTemplates.js";

export const MUNICIPALITY_CODE = "011001001";
const MUNI_SERVICE_URL =
  "https://gisstg229.momah.gov.sa/server/rest/services/Test/BasicMap/MapServer/4";
const SURVEY_DECISION_URL =
  "https://gisstg229.momah.gov.sa/server/rest/services/Test/EditLayers/mapServer/2";

//* fetch Municipality Data
export function fetchMunicipalityData(code = MUNICIPALITY_CODE) {
  return executeBaseQuery(
    MUNI_SERVICE_URL,
    `MUNICIPALITYUNIQUECODE = '${code}'`,
    ["MUNICIPALITYARNAME", "AMANA", "ZONE"],
    `لم يتم العثور على بيانات البلدية بالكود: ${code}`,
  );
}

//* fetch Survey Decision Data
export function fetchSurveyDecisionData(krokino) {
  return executeBaseQuery(
    SURVEY_DECISION_URL,
    `KROKINO = '${krokino}' and KROKITYPE='7018' and ISAPPROVED = 1`,
    ["KROKINO", "LANDAREA"],
    `لم يتم العثور على قرار مساحي معتمد مطابق للرقم: ${krokino}`,
  );
}
