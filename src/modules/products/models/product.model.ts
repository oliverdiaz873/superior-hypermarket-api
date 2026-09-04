import { Schema, model } from "mongoose";
import { toJSONOptions } from "../../../shared/utils/mongo";
import { softDeletePlugin, type SoftDeleteModel } from "../../../shared/plugins/soft-delete.plugin";

export interface IProductCategory {
  name: string;
  slug: string;
}

export interface IProductSubcategory {
  name: string;
  slug: string;
}

export interface IProductBrand {
  name: string;
  slug: string;
}

export interface IProductTranslation {
  name: string;
  description?: string;
}

export interface IProductTranslations {
  es?: IProductTranslation;
  en?: IProductTranslation;
}

export interface IProduct {
  _id: string;
  sku: string;
  name: string;
  description?: string;
  price: number;
  image?: string;
  imageKey?: string;
  imageThumbnailKey?: string;
  translations?: IProductTranslations;
  categoryId: string;
  subcategoryId?: string | null;
  category: IProductCategory;
  subcategory?: IProductSubcategory | null;
  brandId?: string;
  brand?: IProductBrand;
  unit?: string;
  unitQuantity?: number;
  status: "active" | "inactive";
  isAvailable: boolean;
  featured?: boolean;
  isDeleted: boolean;
  deletedAt: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const categoryEmbed = new Schema<IProductCategory>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true },
  },
  { _id: false }
);

const brandEmbed = new Schema<IProductBrand>(
  {
    name: { type: String },
    slug: { type: String },
  },
  { _id: false }
);

const subcategoryEmbed = new Schema<IProductSubcategory>(
  { name: { type: String, required: true }, slug: { type: String, required: true } },
  { _id: false }
);

const translationEmbed = new Schema<IProductTranslation>(
  {
    name: { type: String, required: true },
    description: { type: String },
  },
  { _id: false }
);

const translationsEmbed = new Schema<IProductTranslations>(
  {
    es: { type: translationEmbed },
    en: { type: translationEmbed },
  },
  { _id: false }
);

const productSchema = new Schema<IProduct>(
  {
    _id: { type: String, required: true },
    sku: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String },
    price: { type: Number, required: true, min: 0 },
    image: { type: String },
    imageKey: { type: String },
    imageThumbnailKey: { type: String },
    translations: { type: translationsEmbed },
    categoryId: { type: String, required: true },
    subcategoryId: { type: String, default: null },
    category: { type: categoryEmbed, required: true },
    subcategory: { type: subcategoryEmbed, default: null },
    brandId: { type: String },
    brand: { type: brandEmbed },
    unit: { type: String },
    unitQuantity: { type: Number },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    isAvailable: { type: Boolean, default: true },
    featured: { type: Boolean, default: false },
  },
  { timestamps: true, toJSON: toJSONOptions }
);

productSchema.plugin(softDeletePlugin);

productSchema.index({ categoryId: 1 });
productSchema.index({ categoryId: 1, subcategoryId: 1 });
productSchema.index({ brandId: 1 });
productSchema.index({ "category.slug": 1 });
productSchema.index({ name: "text" });
productSchema.index(
  { sku: 1 },
  { unique: true, partialFilterExpression: { isDeleted: { $eq: false } }, name: "sku_partial_unique" }
);

export const ProductModel = model<IProduct, SoftDeleteModel<IProduct>>("Product", productSchema);
