//* ===== code -> name + color =====
export const LAND_USE = {
  100000: { name: "residential", color: [255, 255, 100, 0.6] },
  307079: { name: "governmentalFacility", color: [21, 19, 248, 0.6] },
  306020: { name: "publicGarden", color: [30, 255, 150, 0.6] },
  200000: { name: "commercial", color: [255, 20, 50, 0.6] },
  201000: { name: "commercialmarkets", color: [255, 140, 0, 0.6] },
};

const fill = (color) => ({
  type: "simple-fill",
  color,
  outline: { color: "black", width: 0.5 },
});

export const layersDictionary = {
  surveys: {
    title: "حدود المخطط - SurveyS",
    renderer: {
      type: "simple",
      symbol: {
        type: "simple-fill",
        color: [0, 0, 0, 0],
        outline: { color: "red", width: 2 },
      },
    },
  },
    plansstreetsplygonss: {
      title: "شوارع المخطط - Streets",
      renderer: { type: "simple", symbol: fill([200, 200, 200, 0.5]) },
    },
  parcelspolygons: {
    title: "قطع الأراضي - Parcels",
    renderer: {
      type: "unique-value",
      field: "USECODE",
      defaultSymbol: fill([255, 255, 255, 0.5]),
      defaultLabel: "استخدامات أخرى / غير معرف",
      uniqueValueInfos: Object.entries(LAND_USE).map(([code, cfg]) => ({
        value: code,
        label: cfg.name,
        symbol: fill(cfg.color),
      })),
    },
    labelClass: {
      symbol: {
        type: "text",
        color: "#000000",
        haloColor: "#ffffff",
        haloSize: "1.5px",
        font: { size: 11, weight: "bold" },
      },
      labelPlacement: "always-horizontal",
      labelExpressionInfo: { expression: "$feature.PARCELNO" },
    },
  },
};
