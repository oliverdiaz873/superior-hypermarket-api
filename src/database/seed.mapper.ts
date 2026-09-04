import type { IProduct } from "../modules/products/models/product.model";
import productsData from "../modules/products/data/products.data";
import { productsI18nEn } from "../modules/products/data/products.i18n.data";
import categoriesData from "../modules/categories/data/categories.data";

export interface CategoryTaxonomyEntry {
  parent: { id: string; name: string; slug: string };
  subcategory?: { name: string; slug: string };
}

export const buildTaxonomyMap = (): Map<string, CategoryTaxonomyEntry> => {
  const map = new Map<string, CategoryTaxonomyEntry>();
  for (const category of categoriesData) {
    const parent = { id: category.id, name: category.name, slug: category.slug };
    map.set(category.slug, { parent });
    for (const sub of category.subcategories) {
      map.set(sub.slug, {
        parent,
        subcategory: { name: sub.name, slug: sub.slug },
      });
    }
  }
  return map;
};

export const buildSubcategoryMap = (): Record<string, string> => {
  const map: Record<string, string> = {};
  for (const category of categoriesData) {
    for (const sub of category.subcategories) {
      map[sub.slug] = sub.name;
    }
  }
  return map;
};

export const mapProduct = (
  raw: (typeof productsData)[number],
  _subcategoryNames?: Record<string, string>
): IProduct => {
  const en = productsI18nEn[raw.id];
  const taxonomyMap = buildTaxonomyMap();
  const entry = taxonomyMap.get(raw.category);

  const parentCategory = entry?.parent ?? {
    id: raw.category,
    name: raw.category,
    slug: raw.category,
  };

  const subcategory = entry?.subcategory ?? null;

  // imageKey como única fuente de verdad; image se deriva en presenter, no se persiste
  return {
    _id: raw.id,
    sku: `sku-${raw.id}`,
    name: raw.name,
    description: `Detalle de ${raw.name}`,
    translations: en ? { en } : undefined,
    price: raw.price,
    imageKey: raw.image,
    categoryId: parentCategory.id,
    subcategoryId: subcategory ? subcategory.slug : null,
    category: {
      name: parentCategory.name,
      slug: parentCategory.slug,
    },
    subcategory,
    unit: raw.unit || undefined,
    unitQuantity: raw.unitQuantity || undefined,
    status: "active",
    isAvailable: true,
    featured: raw.featured === true,
    isDeleted: false,
    deletedAt: null,
  };
};