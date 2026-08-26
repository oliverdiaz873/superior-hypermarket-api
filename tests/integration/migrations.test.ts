import mongoose from "mongoose";
import { ObjectId } from "mongodb";
import type { Document } from "mongodb";
import migration1 from "../../src/database/migrations/0001-create-indexes";
import migration2 from "../../src/database/migrations/0002-add-fields";
import migration7 from "../../src/database/migrations/0007-add-product-featured";
import migration8 from "../../src/database/migrations/0008-set-featured-products";
import migration11 from "../../src/database/migrations/0011-normalize-product-categories";

describe("migraciones", () => {
  let id: ObjectId;

  beforeEach(() => {
    id = new ObjectId();
  });

  describe("0001-create-indexes", () => {
    it("up crea los índices y down los elimina", async () => {
      const db = mongoose.connection.db!;
      const products = db.collection("products");
      await products.insertOne({ _id: id, sku: "sku-1", name: "Arroz" });

      await migration1.up(db);

      const indexes = await products.indexes();
      expect(indexes.map((i) => i.name)).toEqual(
        expect.arrayContaining(["categoryId_1", "brandId_1", "sku_1", "name_text"])
      );

      await migration1.down(db);

      const after = await products.indexes();
      expect(after.map((i) => i.name)).not.toEqual(
        expect.arrayContaining(["categoryId_1", "brandId_1", "sku_1", "name_text"])
      );
    });
  });

  describe("0002-add-fields", () => {
    it("up añade isDeleted/deletedAt y down los elimina", async () => {
      const db = mongoose.connection.db!;
      const products = db.collection("products");
      await products.insertOne({ _id: id, name: "Arroz" });

      await migration2.up(db);

      const doc = await products.findOne({ _id: id });
      expect(doc?.isDeleted).toBe(false);
      expect(doc?.deletedAt).toBeNull();

      await migration2.down(db);

      const after = await products.findOne({ _id: id });
      expect(after?.isDeleted).toBeUndefined();
      expect(after?.deletedAt).toBeUndefined();
    });
  });

  describe("0007-add-product-featured", () => {
    it("up rellena featured:false solo en docs sin el campo e indexa; down lo revierte", async () => {
      const db = mongoose.connection.db!;
      const products = db.collection("products");
      await products.insertOne({ _id: id, name: "Legacy" });
      await products.insertOne({ _id: new ObjectId(), name: "Ya destacado", featured: true });

      await migration7.up(db);

      const legacy = await products.findOne({ _id: id });
      expect(legacy?.featured).toBe(false);

      const featured = await products.findOne({ name: "Ya destacado" });
      expect(featured?.featured).toBe(true);

      const indexes = await products.indexes();
      expect(indexes.map((i) => i.name)).toContain("featured_1");

      await migration7.down(db);

      const after = await products.findOne({ _id: id });
      expect(after?.featured).toBeUndefined();
      const afterIndexes = await products.indexes();
      expect(afterIndexes.map((i) => i.name)).not.toContain("featured_1");
    });
  });

  describe("0008-set-featured-products", () => {
    const featuredIds = [
      "televisor_samsung_75_pulgadas",
      "nevera_lg",
      "ventilador_daiwa",
      "sofa_cama_blanco",
      "carne_de_res_para_hamburguesas",
      "pollo_entero_don_pollo",
      "atun_dimar",
    ];

    it("up marca los 7 destacados (idempotente) y down solo los revierte a false", async () => {
      const db = mongoose.connection.db!;
      const products = db.collection("products");
      await products.insertMany([
        ...featuredIds.map((pid) => ({ _id: pid, name: pid })),
        { _id: new ObjectId(), name: "No destacado", featured: false },
      ] as Document[]);

      await migration8.up(db);
      await migration8.up(db);

      const featuredDocs = await products.find({ featured: true }).toArray();
      expect(featuredDocs.map((f) => f._id).sort()).toEqual([...featuredIds].sort());

      const noDestacado = await products.findOne({ name: "No destacado" });
      expect(noDestacado?.featured).toBe(false);

      await migration8.down(db);

      const after = await products
        .find({ _id: { $in: featuredIds as unknown as ObjectId[] } })
        .toArray();
      for (const doc of after) {
        expect(doc?.featured).toBe(false);
      }
      expect(await products.countDocuments({ featured: true })).toBe(0);
    });
  });

  describe("0011-normalize-product-categories", () => {
    it("up normaliza productos con slug de subcategoría en category.slug y down los revierte", async () => {
      const db = mongoose.connection.db!;
      const categories = db.collection("categories");
      const products = db.collection("products");

      const catId = new ObjectId();
      await categories.insertOne({
        _id: catId,
        name: "Alimentos",
        slug: "alimentos",
        subcategories: [{ name: "Bebidas", slug: "bebidas" }],
      });

      const prodId = new ObjectId();
      await products.insertOne({
        _id: prodId,
        name: "Jugo de Naranja",
        categoryId: "bebidas",
        category: { name: "Bebidas", slug: "bebidas" },
      });

      await migration11.up(db);
      await migration11.up(db); // Test idempotency

      const normalized = await products.findOne({ _id: prodId });
      expect(normalized?.categoryId).toBe(String(catId));
      expect(normalized?.subcategoryId).toBe("bebidas");
      expect(normalized?.category).toEqual({ name: "Alimentos", slug: "alimentos" });
      expect(normalized?.subcategory).toEqual({ name: "Bebidas", slug: "bebidas" });

      await migration11.down(db);

      const reverted = await products.findOne({ _id: prodId });
      expect(reverted?.categoryId).toBe("bebidas");
      expect(reverted?.subcategoryId).toBeNull();
      expect(reverted?.category).toEqual({ name: "Bebidas", slug: "bebidas" });
      expect(reverted?.subcategory).toBeNull();
    });
  });
});
