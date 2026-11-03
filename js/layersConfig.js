//* ===== code -> name + color =====
export const LAND_USE = {
  100000: {
    nameAr: "سكني",
    nameEn: "residential",
    color: [255, 255, 100, 0.6],
  },
  307079: {
    nameAr: "مرفق حكومي",
    nameEn: "governmentalFacility",
    color: [21, 19, 248, 0.6],
  },
  306020: {
    nameAr: "حديقة عامة",
    nameEn: "publicGarden",
    color: [30, 255, 150, 0.6],
  },
  200000: { nameAr: "تجاري", nameEn: "commercial", color: [255, 20, 50, 0.6] },
  201000: {
    nameAr: "أسواق تجارية",
    nameEn: "commercialmarkets",
    color: [255, 140, 0, 0.6],
  },
};

//* --- Helper Funs ---
const fill = (color) => ({
  type: "simple-fill",
  color,
  outline: { color: "black", width: 0.5 },
});

const line = (color) => ({
  type: "simple-line",
  color,
  width: 2,
});

const point = (color) => ({
  type: "simple-marker",
  color,
  size: 6,
  outline: { color: "black", width: 0.5 },
});

//* --- Dictionary of Layers ---
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
  parcelspolygons: {
    title: "قطع الأراضي - Parcels",
    renderer: {
      type: "unique-value",
      field: "USECODE",
      defaultSymbol: fill([255, 255, 255, 0.5]),
      defaultLabel: "استخدامات أخرى / غير معرف",
      uniqueValueInfos: Object.entries(LAND_USE).map(([code, cfg]) => ({
        value: code,
        label: `${cfg.nameAr} / ${cfg.nameEn}`,
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
  plansstreetsplygonss: {
    title: "شوارع المخطط - Streets",
    renderer: { type: "simple", symbol: fill([230, 150, 50, 0.6]) },
  },

  //* === New Layers ===

  approvedboundry: {
    title: "الحدود المعتمدة - ApprovedBoundry",
    renderer: { type: "simple", symbol: fill([230, 150, 50, 0.6]) },
  },
  parcelexcludeds: {
    title: "القطع المستبعدة - ParcelExcludedS",
    renderer: { type: "simple", symbol: fill([150, 110, 180, 0.6]) },
  },
  parcelslinel: {
    title: "خطوط الأراضي - ParcelsLineL",
    renderer: { type: "simple", symbol: line([220, 180, 50, 1]) },
  },
  parcelspointsp: {
    title: "نقاط الأراضي - ParcelsPointsP",
    renderer: { type: "simple", symbol: point([120, 70, 50, 1]) },
  },
  planblockss: {
    title: "البلوكات - PlanBlocksS",
    renderer: { type: "simple", symbol: fill([240, 160, 180, 0.6]) },
  },
  planningappurtenances: {
    title: "ملحقات التخطيط - PlanningAppurtenances",
    renderer: { type: "simple", symbol: fill([230, 150, 50, 0.6]) },
  },
  planscarparkings: {
    title: "مواقف السيارات - PlansCarParkingS",
    renderer: { type: "simple", symbol: fill([150, 110, 180, 0.6]) },
  },
  planslakess: {
    title: "البحيرات - PlansLakesS",
    renderer: { type: "simple", symbol: fill([220, 180, 50, 0.6]) },
  },
  planspavementss: {
    title: "الأرصفة - PlansPavementsS",
    renderer: { type: "simple", symbol: fill([140, 80, 50, 0.6]) },
  },
  plansroadislandss: {
    title: "جزر الطرق - PlansRoadIslandsS",
    renderer: { type: "simple", symbol: fill([140, 80, 50, 0.6]) },
  },
  plansstreetslinel: {
    title: "خطوط الشوارع - PlansStreetsLineL",
    renderer: { type: "simple", symbol: line([240, 160, 180, 1]) },
  },
  walkpathwayss: {
    title: "ممرات المشاة - WalkPathWayS",
    renderer: { type: "simple", symbol: fill([200, 80, 120, 0.6]) },
  },
};
