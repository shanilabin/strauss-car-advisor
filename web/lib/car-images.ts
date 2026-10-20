/**
 * Photos of the catalog cars, by catalog id. ILLUSTRATIVE ONLY: from importer and press sites, not matched
 * to the exact version, year or trim in the catalog - the UI always says "להמחשה" and names the source.
 * A car without a photo here (e.g. CAR-07, whose source showed a different model) gets the silhouette.
 */
export type CarImage = { src: string; width: number; height: number; credit: string };

export const CAR_IMAGES: Readonly<Record<string, CarImage>> = {
  "CAR-01": { src: "/cars/CAR-01.webp", width: 289, height: 161, credit: "kia-israel.co.il" },
  "CAR-02": { src: "/cars/CAR-02.webp", width: 640, height: 345, credit: "toyota.co.il" },
  "CAR-03": { src: "/cars/CAR-03.webp", width: 640, height: 282, credit: "bydauto.co.il" },
  "CAR-04": { src: "/cars/CAR-04.webp", width: 523, height: 172, credit: "seat.com" },
  "CAR-05": { src: "/cars/CAR-05.webp", width: 320, height: 164, credit: "kia-israel.co.il" },
  "CAR-06": { src: "/cars/CAR-06.webp", width: 239, height: 111, credit: "mg-israel.co.il" },
  "CAR-08": { src: "/cars/CAR-08.webp", width: 554, height: 400, credit: "auto.co.il" },
  "CAR-09": { src: "/cars/CAR-09.webp", width: 640, height: 339, credit: "toyota.co.il" },
  "CAR-10": { src: "/cars/CAR-10.webp", width: 640, height: 341, credit: "auto.co.il" },
  "CAR-11": { src: "/cars/CAR-11.webp", width: 270, height: 144, credit: "kia-israel.co.il" },
  "CAR-12": { src: "/cars/CAR-12.webp", width: 558, height: 400, credit: "auto.co.il" },
  "CAR-13": { src: "/cars/CAR-13.webp", width: 640, height: 250, credit: "mazda.co.il" },
  "CAR-14": { src: "/cars/CAR-14.webp", width: 600, height: 400, credit: "auto.co.il" },
  "CAR-15": { src: "/cars/CAR-15.webp", width: 343, height: 112, credit: "skoda.co.il" },
  "CAR-16": { src: "/cars/CAR-16.webp", width: 320, height: 162, credit: "kia-israel.co.il" },
  "CAR-17": { src: "/cars/CAR-17.webp", width: 640, height: 332, credit: "bydauto.co.il" },
  "CAR-18": { src: "/cars/CAR-18.webp", width: 640, height: 353, credit: "toyota.co.il" },
  "CAR-19": { src: "/cars/CAR-19.webp", width: 320, height: 163, credit: "kia-israel.co.il" },
  "CAR-20": { src: "/cars/CAR-20.webp", width: 579, height: 400, credit: "auto.co.il" },
};

export function carImage(catalogId: string | null | undefined): CarImage | null {
  return catalogId ? (CAR_IMAGES[catalogId] ?? null) : null;
}
