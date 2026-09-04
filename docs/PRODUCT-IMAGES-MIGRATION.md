# Migración de imágenes históricas (184 productos)

- **Estado**: Borrador (F0.0)
- **Fase de ejecución**: F7 (después de validar F0–F4)
- **Objetivo**: Trasladar los ~184 assets locales de imagen a Cloudflare R2 y
  dejar el catálogo servido íntegramente desde el object storage.

---

## 1. Contexto

Los dos storefronts (Angular y Next.js) comparten **el mismo catálogo de 184
productos** y **las mismas 184 imágenes locales** en `public/` (formatos `.avif`,
`.png`, `.jpg/.jpeg`, `.webp`; rutas `/assets/images/productos/...`). Son assets
históricos, no deben vivir en el repositorio de forma indefinida.

**Principio:** primero se construye y valida la tubería nueva
(Dashboard → R2 → MongoDB → API → ambos storefronts). **Después** se migra el
catálogo histórico, para poder verificar que la arquitectura nueva funciona antes
de una migración masiva.

## 2. Estrategia

1. **No mover assets todavía.** Mientras no esté F0–F4 en producción, los
   storefronts siguen sirviendo sus datos estáticos e imágenes locales
   (`useMockData=true`).
2. **Script de migración** `scripts/migrate-images.ts` (backend):
    - Lee el catálogo legacy (el mismo que ya usa la seed: 184 productos con `id`).
    - Localiza cada asset local (Angular `public/` / Next.js `public/`) — son el
      mismo conjunto.
    - Sube cada archivo a `products/{id}/{uuid}.{ext}` (key versionada como en la
      tubería nueva; preservando el formato
      original; conversión opcional a WebP en una fase posterior).
    - Actualiza en MongoDB: **solo `imageKey`** (`products/{id}/{uuid}.{ext}`); `image` **no se persiste** desde `0012-normalize-product-image-key` y se deriva en runtime vía `src/shared/utils/resolve-product-image.ts` (`storageProvider.getPublicUrl(imageKey)` + `?v={updatedAt}`). Ver `src/database/migrations/0012-normalize-product-image-key.ts`.
    - Registra en un log los éxitos/fallos y es **idempotente** (no re-subir si ya
      existe la key).
3. **Verificación post-migración:**
   - `GET /api/products` devuelve las 184 URLs de R2.
   - Angular Store y Next.js renderizan las imágenes desde el CDN
     (Angular: `getAssetUrl` acepta URLs absolutas; Next: `remotePatterns`).
   - Auditoría visual de una muestra por categoría.

## 3. Origen de los datos

| Fuente | Ubicación | Uso |
| --- | --- | --- |
| Productos legacy | `src/modules/products/data/products.data.ts` (backend seed) | ids y estructura |
| Assets de imagen | `pre-advanced-websites-hypermarket-angular/public/assets/images/productos/...` y `pre-advanced-websites-hypermarket-next/public/...` | binarios |
| Traducciones EN | claves i18n `products.{id}.name\|description` de ambos storefronts | poblar `translations` en la seed (F3) |

## 4. Reglas

- **Una sola copia en R2** (`products/{id}/{uuid}.{ext}`): nunca duplicar assets
  por storefront.
- Los assets locales **se eliminan del repositorio al final de la migración**
  (decisión a coordinar con git y con el estado de los storefronts).
- La migración **no toca los datos de carrito/órdenes** (usan snapshots).
- Se ejecuta con los mismos controles de seguridad del presign (MIME allowlist,
  tamaño) aunque el origen sea de confianza.

## 5. Criterios de aceptación (F7) — Actualizado tras 0012

- 184/184 productos con **`imageKey`** (`products/{id}/{uuid}.{ext}`) persistido; `image` (URL pública R2/CDN con `?v={updatedAt}`) **derivado** vía `resolveProductImageUrl` (Cart, Orders y Product API resuelven igual).
- 184/184 assets verificables en ambos storefronts (URL resuelta contiene `/uploads/...` o `https://...` + `?v=`).
- `orphan-cleanup.ts` no marca como huérfano ningún `products/{id}/` (Mongo fuente de verdad es `imageKey`).
- Cero imágenes locales referenciadas en código de producción (solo tests/mock).
- Fallback legacy: `image` ya público (`/uploads/...` o `http...`) se preserva con `?v=`; `image: "products/..."` sin `imageKey` resuelve a `null` (no reintroduce bug Cart/Orders).

## 6. Referencias

- `docs/STORAGE-ARCHITECTURE.md` — estructura de keys.
- `docs/ECOMMERCE-DATA-FLOW.md` §6 — flujo de migración.
- `docs/ADR-012-storage-r2.md` — justificación de R2.
