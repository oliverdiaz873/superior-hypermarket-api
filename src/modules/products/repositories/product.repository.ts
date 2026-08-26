import { ProductModel } from "../models/product.model";
import { PRODUCT_SORT_FIELDS, ProductSortField } from "../constants/product-sort-fields";
import { type ISoftDeleteDocument } from "../../../shared/plugins/soft-delete.plugin";
import type { Product, ProductPageResult, ProductQuery, SortDirection } from "../../../types";

const ESCAPE_RE = /[.*+?^${}()|[\]\\]/g;
const escapeRegExp = (value: string) => value.replace(ESCAPE_RE, "\\$&");

const buildSort = (
  sortBy: ProductSortField | undefined,
  sortOrder: SortDirection
): Record<string, 1 | -1> => {
  if (!sortBy || !PRODUCT_SORT_FIELDS.includes(sortBy)) {
    return { createdAt: -1 };
  }
  const direction: 1 | -1 = sortOrder === "asc" ? 1 : -1;
  return { [sortBy]: direction };
};
export const findAll = async (): Promise<Product[]> => {
  const docs = await ProductModel.find();
  return docs.map((doc) => doc.toJSON() as unknown as Product);
};

export const findPage = async (query: ProductQuery): Promise<ProductPageResult> => {
  const { page, limit, q, category, categoryId, subcategoryId, brand, status, isAvailable, featured, sortBy, sortOrder } = query;

  const filter: Record<string, unknown> = {};
  if (category) {
    const slug = category.trim().toLowerCase();
    filter.$or = [{ "category.slug": slug }, { "subcategory.slug": slug }];
  }
  if (categoryId) filter.categoryId = categoryId.trim();
  if (subcategoryId) filter.subcategoryId = subcategoryId.trim();
  if (brand) filter["brand.slug"] = brand.trim().toLowerCase();
  if (status) filter.status = status;
  if (isAvailable === true) filter.isAvailable = true;
  if (featured === true) filter.featured = true;
  if (q && q.trim()) filter.name = { $regex: escapeRegExp(q.trim()), $options: "i" };
  const skip = (page - 1) * limit;
  const sort = buildSort(sortBy, sortOrder ?? "desc");

  const [docs, total] = await Promise.all([
    ProductModel.find(filter).sort(sort).skip(skip).limit(limit),
    ProductModel.countDocuments(filter),
  ]);

  const items = docs.map((doc) => doc.toJSON() as unknown as Product);
  const pages = Math.max(1, Math.ceil(total / limit));
  return { items, total, pagination: { page, limit, total, pages } };
};
export const findById = async (id: string): Promise<Product | null> => {
  const doc = await ProductModel.findById(id);
  return doc ? (doc.toJSON() as unknown as Product) : null;
};

export const findByIds = async (ids: string[]): Promise<Product[]> => {
  const docs = await ProductModel.find({ _id: { $in: ids } });
  const byId = new Map(docs.map((doc) => [doc._id as string, doc.toJSON() as unknown as Product]));
  return ids.map((id) => byId.get(id)).filter((p): p is Product => Boolean(p));
};
export const findIdsByNameOrSku = async (term: string): Promise<string[]> => {
  const trimmed = term.trim();
  if (!trimmed) return [];
  const docs = await ProductModel.find({
    $or: [
      { name: { $regex: escapeRegExp(trimmed), $options: "i" } },
      { sku: { $regex: escapeRegExp(trimmed), $options: "i" } },
    ],
  })
    .select("_id")
    .limit(500);
  return docs.map((doc) => doc._id as string);
};

export const findBySku = async (sku: string): Promise<Product | null> => {
  const doc = await ProductModel.findOne({ sku });
  return doc ? (doc.toJSON() as unknown as Product) : null;
};

export const existsByCategoryId = async (categoryId: string): Promise<boolean> => {
  const doc = await ProductModel.exists({ categoryId });
  return Boolean(doc);
};

export const existsByBrandId = async (brandId: string): Promise<boolean> => {
  const doc = await ProductModel.exists({ brandId });
  return Boolean(doc);
};

export const updateCategoryEmbeds = async (
  categoryId: string,
  data: { name: string; slug: string }
): Promise<void> => {
  await ProductModel.updateMany({ categoryId }, { $set: { category: data } });
};

export const updateBrandEmbeds = async (
  brandId: string,
  data: { name: string; slug: string }
): Promise<void> => {
  await ProductModel.updateMany({ brandId }, { $set: { brand: data } });
};
export const create = async (
  data: Omit<Product, "id" | "createdAt" | "updatedAt"> & { _id: string }
): Promise<Product> => {
  const doc = await ProductModel.create(data);
  return doc.toJSON() as unknown as Product;
};

export const updateById = async (
  id: string,
  updates: Record<string, unknown>,
  options?: { unset?: string[] }
): Promise<Product | null> => {
  const updateDoc: Record<string, unknown> = { $set: updates };
  if (options?.unset && options.unset.length > 0) {
    updateDoc.$unset = Object.fromEntries(options.unset.map((key) => [key, 1]));
  }
  const doc = await ProductModel.findByIdAndUpdate(id, updateDoc, { returnDocument: "after" });
  return doc ? (doc.toJSON() as unknown as Product) : null;
};

export const softDeleteById = async (id: string): Promise<boolean> => {
  const doc = (await ProductModel.findById(id)) as unknown as ISoftDeleteDocument | null;
  if (!doc) return false;
  await doc.softDelete();
  return true;
};

export const restoreById = async (id: string): Promise<boolean> => {
  const doc = (await ProductModel.findOne({ _id: id, includeDeleted: true })) as unknown as ISoftDeleteDocument | null;
  if (!doc) return false;
  await doc.restore();
  return true;
};

export const search = async (query: string, category?: string): Promise<Product[]> => {
  const term = query.trim();
  const filters: Record<string, unknown> = { status: "active", isAvailable: true };
  if (category) {
    const slug = category.trim().toLowerCase();
    filters.$or = [{ "category.slug": slug }, { "subcategory.slug": slug }];
  }

  if (term.split(/\s+/).length > 1) {
    const docs = await ProductModel.find({ $text: { $search: term }, ...filters }).sort({
      score: { $meta: "textScore" },
    });
    if (docs.length > 0) {
      return docs.map((doc) => doc.toJSON() as unknown as Product);
    }
  }

  const docs = await ProductModel.find({ name: { $regex: escapeRegExp(term), $options: "i" }, ...filters });
  return docs.map((doc) => doc.toJSON() as unknown as Product);
};
