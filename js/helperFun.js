import { LAND_USE } from "./layersConfig.js";

export const getLandUseName = (code) => {
  const use = LAND_USE[String(code)];
  if (use) {
    return `${use.nameAr} / ${use.nameEn}`;
  }
  return "غير معرف / unknown_" + code;
};

export const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const round2 = (n) => Math.round(n * 100) / 100;

export function findLayer(layers, name) {
  return layers.find(
    (l) =>
      (l.fileName || "").split("/").pop().toLowerCase() === name.toLowerCase(),
  );
}
