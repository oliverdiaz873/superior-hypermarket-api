import type { Migration } from "./types";
import type { Db } from "mongodb";

/**
 * Normaliza productos legacy con `image="products/..."` y `imageKey=null`.
 *
 * Objetivo limpio: `imageKey` como única fuente de verdad en MongoDB.
 * `image` NO se persiste con URL (evita duplicar y acoplar DB al entorno
 * local vs R2/CDN). La URL pública se deriva en el presenter via
 * `getPublicUrl(imageKey)` + `?v=updatedAt`.
 *
 * Antes: 184 productos seed con `image: "products/bebidas/coca-cola.avif"` y `imageKey: undefined`
 * Después: `imageKey: "products/bebidas/coca-cola.avif"` y `image` eliminado (`$unset`)
 *          API expone `image: "/uploads/products/bebidas/coca-cola.avif?v=..."` derivado.
 *
 * Idempotente: solo migra donde `imageKey` es null/undefined y `image` parece storage key.
 * No destructiva: no borra productos modernos con `imageKey` ya existente.
 * Reporta `skipped`/`unresolved` sin forzar ni borrar.
 */

const isLegacyImageKey = (image: unknown): boolean =>
  typeof image === "string" && (image.startsWith("products/") || image.startsWith("/products/"));

const migration: Migration = {
  version: 12,
  name: "normalize-product-image-key",
  up: async (db: Db) => {
    const products = db.collection("products");
    const cursor = products.find({
      $or: [{ imageKey: { $exists: false } }, { imageKey: null }],
      image: { $type: "string" },
    });

    let migrated = 0;
    let skipped = 0;
    let unresolved = 0;

    for await (const doc of cursor) {
      const image = (doc as { image?: unknown }).image;
      if (!isLegacyImageKey(image)) {
        skipped++;
        continue;
      }
      const key =
        typeof image === "string" && image.startsWith("/") ? image.slice(1) : (image as string);
      // Validación mínima de key segura (products/... con 2-3 segmentos)
      if (!key.startsWith("products/") || key.includes("..") || key.includes("\\")) {
        unresolved++;
        console.log(`[migrate:0012] Unresolved (key no segura): ${doc._id} -> ${image}`);
        continue;
      }
      await products.updateOne(
        { _id: doc._id },
        {
          $set: {
            imageKey: key,
            updatedAt: new Date(),
          },
          $unset: {
            image: 1,
          },
        },
      );
      migrated++;
    }

    // Fase 2: limpiar duplicados modernos donde image ya es URL pública y imageKey existe
    // (ej. seed anterior con image=/uploads/... + imageKey, o productos creados vía Dashboard)
    const modernCursor = products.find({
      imageKey: { $type: "string" },
      image: { $type: "string" },
    });
    let cleanedModern = 0;
    for await (const doc of modernCursor) {
      const image = (doc as { image?: unknown }).image;
      const imageKey = (doc as { imageKey?: string }).imageKey;
      if (
        typeof image === "string" &&
        (image.startsWith("/uploads/") || image.startsWith("http")) &&
        isLegacyImageKey(imageKey)
      ) {
        await products.updateOne(
          { _id: doc._id },
          {
            $unset: { image: 1 },
            $set: { updatedAt: new Date() },
          },
        );
        cleanedModern++;
      }
    }

    console.log(
      `[migrate:0012] Migrados legacy: ${migrated}, omitidos (no legacy): ${skipped}, no resueltos: ${unresolved}, limpiados modernos: ${cleanedModern}`,
    );
  },
  down: async (db: Db) => {
    const products = db.collection("products");
    const cursor = products.find({
      imageKey: { $type: "string" },
    });

    let reverted = 0;
    for await (const doc of cursor) {
      const imageKey = (doc as { imageKey?: string }).imageKey;
      if (!imageKey || !isLegacyImageKey(imageKey)) continue;
      await products.updateOne(
        { _id: doc._id },
        {
          $set: {
            image: imageKey,
            updatedAt: new Date(),
          },
          $unset: {
            imageKey: 1,
          },
        },
      );
      reverted++;
    }
    console.log(`[migrate:0012] Revertidos: ${reverted}`);
  },
};

export default migration;
