import { getStorageProvider } from "../../../shared/storage/storage.factory";
import { logger } from "../../../shared/logger/logger";
import type { Product, ProductStatus } from "../../../types";

export type Lang = "es" | "en" | undefined;

/** Producto tal como lo consume la API pública: sin claves internas ni traducciones. */
export interface PublicProduct {
  id: string;
  sku: string;
  name: string;
  description?: string;
  price: number;
  image: string | null;
  categoryId: string;
  subcategoryId?: string | null;
  category: { name: string; slug: string };
  subcategory?: { name: string; slug: string } | null;
  brandId?: string;
  brand?: { name: string; slug: string };
  unit?: string;
  unitQuantity?: number;
  status: ProductStatus;
  isAvailable: boolean;
  featured: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Producto tal como lo consume el Dashboard (boundary administrativo).
 * Incluye los campos internos que la API pública jamás expone:
 * `translations` (solo `en` en F4; el ES vive en `name`/`description` raíz),
 * `imageKey` y `imageThumbnailKey`.
 */
export interface AdminProduct {
  id: string;
  sku: string;
  name: string;
  description?: string;
  price: number;
  image: string | null;
  imageKey?: string;
  imageThumbnailKey?: string;
  translations?: { en?: { name: string; description?: string } };
  categoryId: string;
  subcategoryId?: string | null;
  category: { name: string; slug: string };
  subcategory?: { name: string; slug: string } | null;
  brandId?: string;
  brand?: { name: string; slug: string };
  unit?: string;
  unitQuantity?: number;
  status: ProductStatus;
  isAvailable: boolean;
  featured: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const normalizeLang = (lang: unknown): Lang => (lang === "es" || lang === "en" ? lang : undefined);

/** Un producto es público solo si cumple AMBOS ejes: lifecycle `active` y disponibilidad real. */
export const isPubliclyVisible = (product: Product): boolean =>
  product.status === "active" && product.isAvailable === true;

const cacheBust = (url: string, version?: Date): string => {
  if (!version) return url;
  const prefix = url.includes("?") ? "&" : "?";
  return `${url}${prefix}v=${encodeURIComponent(version.toISOString())}`;
};

const resolvePublicImage = (product: Product): string | null => {
  if (product.imageKey) {
    try {
      return cacheBust(getStorageProvider().getPublicUrl(product.imageKey), product.updatedAt);
    } catch {
      logger.warn("Failed to resolve public image URL", { imageKey: product.imageKey });
      return null;
    }
  }
  // Tras 0012, image ya no se persiste como key; si existe y es URL pública, se retorna
  if (product.image && (product.image.startsWith("/uploads/") || product.image.startsWith("http"))) {
    try {
      return cacheBust(product.image, product.updatedAt);
    } catch {
      return product.image;
    }
  }
  return null;
};

const resolveTranslatedName = (product: Product, lang?: Lang): string =>
  lang && product.translations?.[lang]?.name ? product.translations[lang].name : product.name;

const resolveTranslatedDescription = (product: Product, lang: Lang): string | undefined => {
  if (lang && product.translations?.[lang]?.description !== undefined) {
    return product.translations[lang].description;
  }
  return product.description;
};

export const toPublicProduct = (product: Product, lang?: Lang): PublicProduct => ({
  id: product.id,
  sku: product.sku,
  name: resolveTranslatedName(product, lang),
  description: resolveTranslatedDescription(product, lang),
  price: product.price,
  image: resolvePublicImage(product),
  categoryId: product.categoryId,
  subcategoryId: product.subcategoryId ?? null,
  category: product.category,
  subcategory: product.subcategory ?? null,
  brandId: product.brandId,
  brand: product.brand,
  unit: product.unit,
  unitQuantity: product.unitQuantity,
  status: product.status,
  isAvailable: product.isAvailable,
  featured: product.featured === true,
  createdAt: product.createdAt,
  updatedAt: product.updatedAt,
});

/**
 * Boundary administrativo: incluye `translations`, `imageKey` y
 * `imageThumbnailKey`. Solo se usa en rutas /api/admin/products.
 */
export const toAdminProduct = (product: Product): AdminProduct => ({
  id: product.id,
  sku: product.sku,
  name: product.name,
  description: product.description,
  price: product.price,
  image: resolvePublicImage(product),
  imageKey: product.imageKey,
  imageThumbnailKey: product.imageThumbnailKey,
  translations: product.translations?.en ? { en: product.translations.en } : undefined,
  categoryId: product.categoryId,
  subcategoryId: product.subcategoryId ?? null,
  category: product.category,
  subcategory: product.subcategory ?? null,
  brandId: product.brandId,
  brand: product.brand,
  unit: product.unit,
  unitQuantity: product.unitQuantity,
  status: product.status,
  isAvailable: product.isAvailable,
  featured: product.featured === true,
  createdAt: product.createdAt,
  updatedAt: product.updatedAt,
});
