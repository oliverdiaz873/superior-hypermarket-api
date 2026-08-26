import type { Migration } from "./types";
import type { Db } from "mongodb";

export interface TaxonomyEntry {
  parent: { id: string; name: string; slug: string };
  subcategory: { name: string; slug: string };
}

export interface ProductSnapshot {
  _id: string | import("mongodb").ObjectId;
  name?: string;
  categoryId?: string;
  subcategoryId?: string | null;
  category?: { name: string; slug: string };
  subcategory?: { name: string; slug: string } | null;
}

const buildTaxonomyMap = async (db: Db): Promise<Map<string, TaxonomyEntry[]>> => {
  const categories = await db
    .collection("categories")
    .find({ isDeleted: { $ne: true } })
    .toArray();
  const map = new Map<string, TaxonomyEntry[]>();

  for (const category of categories) {
    const parent = {
      id: String(category._id),
      name: String(category.name),
      slug: String(category.slug),
    };
    for (const subcategory of category.subcategories ?? []) {
      const entry: TaxonomyEntry = {
        parent,
        subcategory: { name: String(subcategory.name), slug: String(subcategory.slug) },
      };
      const entries = map.get(entry.subcategory.slug) ?? [];
      entries.push(entry);
      map.set(entry.subcategory.slug, entries);
    }
  }

  return map;
};

const migration: Migration = {
  version: 11,
  name: "normalize-product-categories",
  up: async (db: Db) => {
    const productsCollection = db.collection("products");
    const taxonomyMap = await buildTaxonomyMap(db);
    const products = (await productsCollection.find({}).toArray()) as unknown as ProductSnapshot[];

    for (const product of products) {
      const currentCategorySlug = product.category?.slug ?? product.categoryId;
      if (!currentCategorySlug) continue;

      const matchingEntries = taxonomyMap.get(currentCategorySlug) ?? [];
      if (matchingEntries.length === 1 && !product.subcategory?.slug) {
        const entry = matchingEntries[0];
        const filter = { _id: product._id } as import("mongodb").Filter<import("mongodb").Document>;
        await productsCollection.updateOne(
          filter,
          {
            $set: {
              categoryId: entry.parent.id,
              subcategoryId: entry.subcategory.slug,
              category: { name: entry.parent.name, slug: entry.parent.slug },
              subcategory: { name: entry.subcategory.name, slug: entry.subcategory.slug },
            },
          }
        );
      }
    }
  },
  down: async (db: Db) => {
    const productsCollection = db.collection("products");
    const taxonomyMap = await buildTaxonomyMap(db);
    const products = (await productsCollection.find({}).toArray()) as unknown as ProductSnapshot[];

    for (const product of products) {
      if (product.subcategory?.slug) {
        const subSlug = product.subcategory.slug;
        const matchingEntries = taxonomyMap.get(subSlug) ?? [];
        if (matchingEntries.length === 1) {
          const entry = matchingEntries[0];
          const filter = { _id: product._id } as import("mongodb").Filter<import("mongodb").Document>;
          await productsCollection.updateOne(
            filter,
            {
              $set: {
                categoryId: subSlug,
                subcategoryId: null,
                category: { name: entry.subcategory.name, slug: subSlug },
                subcategory: null,
              },
            }
          );
        }
      }
    }
  },
};

export default migration;
