import { getStorageProvider } from "../storage/storage.factory";
import { logger } from "../logger/logger";
import type { Product } from "../../types";

/**
 * Única fuente de verdad para transformar imageKey/image en URL pública servible.
 * Orden de prioridad: imageKey -> getPublicUrl + cacheBust; fallback legacy image ya pública (/uploads/ o http).
 * No devuelve "products/..." crudo — siempre URL pública o null.
 */
const cacheBust = (url: string, version?: Date): string => {
  if (!version) return url;
  const prefix = url.includes("?") ? "&" : "?";
  return `${url}${prefix}v=${encodeURIComponent(version.toISOString())}`;
};

export const resolveProductImageUrl = (
  product: Pick<Product, "image" | "imageKey" | "updatedAt">,
): string | null => {
  if (product.imageKey) {
    try {
      return cacheBust(getStorageProvider().getPublicUrl(product.imageKey), product.updatedAt);
    } catch {
      logger.warn("Failed to resolve public image URL", { imageKey: product.imageKey });
      return null;
    }
  }
  // Compat legacy: producto con image ya es URL pública (https://... o /uploads/...)
  if (
    product.image &&
    (product.image.startsWith("/uploads/") || product.image.startsWith("http"))
  ) {
    try {
      return cacheBust(product.image, product.updatedAt);
    } catch {
      return product.image;
    }
  }
  return null;
};
