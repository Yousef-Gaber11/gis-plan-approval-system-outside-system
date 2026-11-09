import { zonesFeatureCollection } from "./zonesData.js";

const ZONES_SERVICE_URL =
  "https://gisstg229.momah.gov.sa/server/rest/services/Test/BasicMap/MapServer/4";

export async function detectZoneWithFallback(
  decisionPolygon,
  FeatureLayer,
  geometryEngine,
  Polygon,
  Graphic,
) {
  let bestZoneWkid = null;
  let maxArea = -1;
  let detectionMethod = "";

  //* step 1 --> try to detect zone using the service
  // try {
  //   const zonesLayer = new FeatureLayer({ url: ZONES_SERVICE_URL });
  //   const zonesResult = await zonesLayer.queryFeatures({
  //     geometry: decisionPolygon,
  //     spatialRelationship: "intersects",
  //     outFields: ["ZONE"],
  //     returnGeometry: true,
  //   });

  //   if (zonesResult.features && zonesResult.features.length > 0) {
  //     for (const zFeature of zonesResult.features) {
  //       try {
  //         const intersectGeom = geometryEngine.intersect(
  //           zFeature.geometry,
  //           decisionPolygon,
  //         );
  //         if (intersectGeom) {
  //           const area = Math.abs(
  //             geometryEngine.geodesicArea(intersectGeom, "square-meters"),
  //           );
  //           if (area > maxArea) {
  //             maxArea = area;
  //             if (zFeature.attributes.ZONE) {
  //               bestZoneWkid = parseInt(zFeature.attributes.ZONE, 10);
  //               detectionMethod = "Service FeatureLayer (Online)";
  //             }
  //           }
  //         }
  //       } catch (e) {
  //         console.warn("تعذر حساب مساحة التقاطع مع نطاق السيرفس.", e);
  //       }
  //     }
  //   }
  // } catch (err) {
  //   console.warn(
  //     "فشل الاستعلام من سيرفس الـ Zones المباشر، جاري الانتقال للبديل المحلي...",
  //     err,
  //   );
  // }

  //* step 2 --> try to detect zone using the local zonesFeatureCollection
  // if (!bestZoneWkid) {
    try {
      console.log(
        "جاري الفحص باستخدام ملف الداتا المحلي للزونز (zonesFeatureCollection)...",
      );

      const graphics = zonesFeatureCollection.features.map((feat, index) => {
        const polyGeom = new Polygon({
          rings: feat.geometry.rings,
          spatialReference: feat.geometry.spatialReference,
        });
        return new Graphic({
          geometry: polyGeom,
          attributes: {
            OBJECTID: feat.attributes.OBJECTID || index + 1,
            ZONE: feat.attributes.ZONE,
          },
        });
      });

      const localZonesLayer = new FeatureLayer({
        source: graphics,
        objectIdField: "OBJECTID",
        geometryType: "polygon",
        fields: [
          { name: "OBJECTID", type: "oid" },
          { name: "ZONE", type: "integer" },
        ],
        spatialReference: { wkid: 4326 },
      });

      const localResult = await localZonesLayer.queryFeatures({
        geometry: decisionPolygon,
        spatialRelationship: "intersects",
        outFields: ["ZONE"],
        returnGeometry: true,
      });

      if (localResult.features && localResult.features.length > 0) {
        let localMaxArea = -1;
        for (const f of localResult.features) {
          try {
            const hit = geometryEngine.intersect(f.geometry, decisionPolygon);
            if (!hit) continue;
            const area = Math.abs(
              geometryEngine.geodesicArea(hit, "square-meters"),
            );
            if (area > localMaxArea) {
              localMaxArea = area;
              if (f.attributes.ZONE) {
                bestZoneWkid = parseInt(f.attributes.ZONE, 10);
                detectionMethod = "Local Data File (zonesFeatureCollection)";
              }
            }
          } catch (e) {
            console.warn(
              "تعذر حساب التقاطع المحلي مع الزون رقم",
              f.attributes.ZONE,
              e,
            );
          }
        }
      }
    } catch (e) {
      console.warn(
        "فشل الفحص باستخدام ملف الداتا المحلي، الانتقال للحل الرياضي...",
        e,
      );
    }
  // }

  //* step 3 --> fallback to mathematical calculation
  let calculatedZoneNumber = null;
  if (!bestZoneWkid) {
    try {
      const centerX = decisionPolygon.extent
        ? decisionPolygon.extent.center.x
        : decisionPolygon.rings[0][0][0];

      calculatedZoneNumber = Math.floor((centerX + 180) / 6) + 1;
      bestZoneWkid = 32600 + calculatedZoneNumber;
      detectionMethod = "Mathematical Calculation (Fallback)";

      console.log(
        `تم استنتاج الزون رياضياً: Zone ${calculatedZoneNumber} (WKID: ${bestZoneWkid})`,
      );
    } catch (e) {
      throw new Error(
        "القرار المساحي يقع خارج النطاقات المعتمدة، وفشل النظام في استنتاج الزون بكافة الطرق.",
      );
    }
  }

  //^ Determine the final WKID and Zone Number based on the best detection method
  let finalWkid = bestZoneWkid;
  let finalZoneNumber = calculatedZoneNumber;

  if (bestZoneWkid) {
    if (bestZoneWkid < 30000) {
      finalWkid = 32600 + bestZoneWkid;
      finalZoneNumber = bestZoneWkid;
    } else {
      finalZoneNumber = bestZoneWkid - 32600;
      finalWkid = bestZoneWkid;
    }
  } else if (calculatedZoneNumber) {
    finalWkid = 32600 + calculatedZoneNumber;
    finalZoneNumber = calculatedZoneNumber;
  }
  console.log(
    `%c[Zone Success] Method: ${detectionMethod} | Zone Number: ${finalZoneNumber} | WKID: ${finalWkid}`,
    "color: green; font-weight: bold;",
  );
  return {
    wkid: finalWkid,
    number: finalZoneNumber,
    method: detectionMethod,
  };
}
