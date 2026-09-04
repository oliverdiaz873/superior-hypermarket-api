import type { Migration } from "./types";
import type { Db } from "mongodb";

/**
 * Backfill para `unitQuantity` en productos históricos.
 *
 * Contexto de dominio: `unit` (ej "kg") + `unitQuantity` (ej 2) representan
 * el *contenido* de una presentación comercial: `2 kg` = cada unidad vendida
 * contiene 2 kg. No confundir con `stock` (unidades disponibles).
 *
 * Productos seed antiguos se crearon con `unit:"kg"` y sin `unitQuantity`,
 * lo que implícitamente significaba `1 kg`. La UI ya hace `quantity ?? 1`,
 * pero para tener datos estructurados se materializa `1` en DB.
 *
 * Idempotente: solo migra donde `unit` es string no vacío y `unitQuantity`
 * no existe o es null. No toca productos que ya tienen `unitQuantity`
 * (incluido `0.5`, `1.5`, `2`, `6`).
 * Reversible: `down` elimina solo aquellos con `unitQuantity:1` que fueron
 * creados por este backfill (no distingue, pero es seguro porque `1` es el
 * valor por defecto histórico).
 */

const migration: Migration = {
  version: 13,
  name: "backfill-unit-quantity",
  up: async (db: Db) => {
    const products = db.collection("products");

    const cursor = products.find({
      unit: { $type: "string" },
      $or: [{ unitQuantity: { $exists: false } }, { unitQuantity: null }],
    });

    let migrated = 0;
    let skippedEmpty = 0;

    for await (const doc of cursor) {
      const unit = (doc as { unit?: unknown }).unit;
      if (typeof unit !== "string" || !unit.trim()) {
        skippedEmpty++;
        continue;
      }
      await products.updateOne(
        { _id: doc._id },
        {
          $set: {
            unitQuantity: 1,
            updatedAt: new Date(),
          },
        }
      );
      migrated++;
    }

    console.log(`[migrate:0013] Migrados (unit -> 1): ${migrated}, omitidos (unit vacío): ${skippedEmpty}`);
  },
  down: async (db: Db) => {
    const products = db.collection("products");

    // Revertir solo los que tienen 1 y que no tenían valor antes.
    // Como no hay marca, se revierten todos los 1 que tengan unit (asumiendo que fueron backfill).
    // Productos creados explícitamente con 1 también se revertirán, pero es seguro porque 1 es el default de lectura (quantity ?? 1).
    const result = await products.updateMany(
      { unitQuantity: 1, unit: { $type: "string" } },
      { $unset: { unitQuantity: 1 }, $currentDate: { updatedAt: true } }
    );

    console.log(`[migrate:0013] Revertidos (unset 1): ${result.modifiedCount}`);
  },
};

export default migration;
