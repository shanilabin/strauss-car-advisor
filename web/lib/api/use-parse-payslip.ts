"use client";

import { useMutation } from "@tanstack/react-query";

import { api } from "./client";
import type { components } from "./schema";

export type PayslipParse = components["schemas"]["PayslipParseResponse"];
export type PayslipReading = PayslipParse["reading"];
type ContentType = components["schemas"]["PayslipParseRequest"]["content_type"];

const TYPES: readonly ContentType[] = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 3 * 1024 * 1024; // the API's own limit

export class PayslipError extends Error {}

async function toBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** POST /v1/payslip/parse - the values as printed, for the employee to confirm. Nothing is saved. */
export function useParsePayslip() {
  return useMutation({
    mutationFn: async (file: File): Promise<PayslipParse> => {
      const type = TYPES.find((t) => t === file.type);
      if (!type) throw new PayslipError("אפשר להעלות PDF או תמונה (PNG, JPG, WEBP).");
      if (file.size > MAX_BYTES) throw new PayslipError("הקובץ גדול מדי (עד 3MB). אפשר לצלם רק את העמוד הראשון.");
      const { data, error } = await api.POST("/v1/payslip/parse", {
        body: { content_type: type, data_base64: await toBase64(file) },
      });
      if (error) throw new PayslipError(error.error.message_he);
      if (!data) throw new PayslipError("קריאת התלוש נכשלה. נסו שוב.");
      return data;
    },
  });
}
