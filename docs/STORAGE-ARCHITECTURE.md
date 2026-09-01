# Storage Architecture — Imágenes de productos

- **Estado**: Borrador (F0.0)
- **Alcance**: Definición del almacenamiento de imágenes de productos vía object storage
  (Cloudflare R2 en producción). Consulta `docs/ADR-012-storage-r2.md` para la justificación
  de la elección y `docs/SYSTEM-MODELING.md §6` para el contexto de arquitectura.

---

## 1. Principios

1. **El binario nunca vive en MongoDB.** La base de datos almacena únicamente
   `image` (URL pública) e `imageKey` (referencia interna de storage).
2. **El binario nunca vive en el servidor Express.** El backend genera presigned
   URLs; el archivo viaja directo del Dashboard al object storage.
3. **El binario nunca vive en el repositorio git ni en los frontends.**
   Los assets históricos locales son temporales y se migrarán (ver
   `docs/PRODUCT-IMAGES-MIGRATION.md`).
4. **Una sola fuente de verdad de multimedia.** Angular Store y Next.js consumen
   las mismas URLs públicas de R2/CDN. No hay copias por storefront.

## 2. Proveedores (patrón de intercambio)

Toda la interacción con storage ocurre a través de la interfaz
`ObjectStorageProvider` (`src/shared/storage/object-storage.provider.ts`, F0):

| Proveedor | Entorno | Descripción |
| --- | --- | --- |
| `R2StorageProvider` | producción | SDK S3-compatible (`@aws-sdk/client-s3`), presigned PUT/HEAD/DELETE. |
| `LocalStorageProvider` | desarrollo/test | Directorio local servido por Express; implementa el mismo contrato de presign para no cambiar el flujo del Dashboard. |

El dominio de productos solo depende de la interfaz; el proveedor se selecciona
por configuración (`STORAGE_PROVIDER`, ver `docs/API-CONTRACT.md` §6 y `src/config`).

## 3. Estructura de claves en R2

```
products/
  {productId}/
    {uuid}.{ext}         ← imagen principal (key versionada desde el presign)
pending/
  {uuid}.{ext}             ← red de seguridad SOLO para uploads en curso/abandonados
```

Reglas:

- **Cada presign genera una key versionada e inmutable**
  `products/{productId}/{uuid}.{ext}`. No existe la operación de *move/copy*
  `pending → products` en el flujo normal.
- **El presign no genera el `productId`**: el cliente lo envía (el producto se
  creó antes con `POST /api/products`). La key siempre vive bajo el producto
  que la solicitó.
- Para cambiar la imagen se crea una **nueva key**, se confirma con `PATCH` y la
  anterior se elimina tras el éxito de Mongo (nunca se sobrescribe la vigente).
- `pending/` se usa únicamente para uploads interrumpidos (si el cliente abandona
  entre el presign y la confirmación). No es parte del flujo normal.
- Los frontends **nunca construyen ni interpretan keys**: solo envían el `key`
  devuelto por el presign de vuelta al backend, y el backend valida que corresponda
  al producto.

## 4. Contrato de imagen (campos de producto)

| Campo | Tipo | Dónde vive | Responsabilidad |
| --- | --- | --- | --- |
| `imageKey` | string | **MongoDB** (única fuente de verdad persistida) | Clave del objeto en storage (`products/{id}/{uuid}.{ext}`). Solo backend: reemplazo/eliminación. Desde `0012-normalize-product-image-key` es la única columna persistida para la imagen. |
| `image` | string (URL) \| null | **Derivado en runtime** (no se persiste) | URL pública (CDN) con `?v={updatedAt}` resuelta vía `src/shared/utils/resolve-product-image.ts` (`storageProvider.getPublicUrl(imageKey)` + `cacheBust`). La consumen Angular Store, Next.js, Cart y Orders. `imageKey` es la fuente; `product.image` legacy solo se usa como fallback si ya es URL pública (`/uploads/...` o `http...`). |
| `imageThumbnailKey` | string? | MongoDB | Clave de la miniatura (opcional, generada client-side en F2). |

- **Derivación:** `image` **no se persiste** desde `0012`. El presenter y los servicios Cart/Orders resuelven `imageKey` con `resolveProductImageUrl(product)`; nunca leer `product.image` como fuente principal. Ver `src/database/migrations/0012-normalize-product-image-key.ts`.
- **Cache-busting:** la URL pública de `image` se sirve con `?v={updatedAt}` para
  evitar servir cache vieja tras un reemplazo. `Cache-Control: public,
  max-age=31536000, immutable` como metadata del objeto.

## 5. Límites y validación

| Regla | Valor |
| --- | --- |
| MIME permitidos | `image/jpeg`, `image/png`, `image/webp`, `image/avif`, `image/gif` |
| Tamaño máximo | 5 MB |
| Expiración presigned PUT | 5–10 minutos |
| Validación de contenido | Client-side (Dashboard) + allowlist de MIME en el presign; el `contentType` queda firmado en la URL presignada |

> **Limitación conocida de R2:** el presigned PUT no fuerza MIME ni tamaño en el
> objeto final. La verificación es *best-effort* (client-side + HEAD del objeto
> al crear/editar el producto).

## 6. Ciclo de vida de la imagen

| Evento | Comportamiento |
| --- | --- |
| **Crear producto** | `POST /api/products` → draft (`status: inactive`, `isAvailable: false`, `image: null`). |
| **Subir imagen** | Presign (`products/{id}/{uuid}.{ext}`) → PUT directo → `PATCH` confirma `imageKey` (**solo `imageKey` se persiste**; `image` se deriva vía `resolveProductImageUrl`). La confirmación **no activa** el producto. |
| **Activación** | `PATCH /api/products/:id { status: "active", isAvailable: true }` — explícita. |
| **Reemplazar imagen** | Nuevo presign (nueva key versionada) → PUT → `PATCH imageKey` (**actualiza solo `imageKey`**; `image` se recalcula) → se elimina la anterior después del éxito de Mongo. |
| **Confirm OK pero Mongo falla** | La imagen anterior sigue vigente; el objeto nuevo queda huérfano y lo elimina el job (regla 24 h). |
| **Eliminar producto** | `DELETE` borra documento + inventario + prefijo `products/{id}/` vía `deletePrefix` (best-effort) + job como respaldo. |
| **Upload abandonado** | El objeto queda en `pending/` o sin confirmar; lo elimina el job (regla 1 h / 24 h). |
| **Imagen inválida** | 400 antes de tocar el storage (validación en presign). |

## 7. Estrategia anti-huérfanos

`scripts/orphan-cleanup.ts` (ejecutable con `npm run cleanup:orphans`):

1. **`pending/`**: elimina objetos con más de **1 hora** de antigüedad.
2. **`products/{id}/`**: para cada producto toma el `imageKey` vigente (Mongo es
   la fuente de verdad); elimina todo objeto que **no sea** la key vigente y
   tenga más de **24 horas**.
3. Nunca elimina la key referenciada ni objetos recientes (protege uploads en
   vuelto). Los objetos sin timestamp se conservan.
4. Es **idempotente**, registra en logs cada acción y continúa si un borrado falla.

## 8. Configuración de entorno

Variables (añadidas en F0 a `.env.example` y `src/config`):

| Variable | Descripción |
| --- | --- |
| `STORAGE_PROVIDER` | `local` \| `s3` (R2 es compatible con S3) |
| `R2_ACCOUNT_ID` | ID de cuenta Cloudflare |
| `R2_ACCESS_KEY_ID` | Clave de acceso R2 |
| `R2_SECRET_ACCESS_KEY` | Secreto R2 |
| `R2_BUCKET` | Nombre del bucket |
| `R2_ENDPOINT` | Endpoint S3 de R2 (`https://{account_id}.r2.cloudflarestorage.com`) |
| `R2_PUBLIC_URL` | Dominio público/CDN para servir los objetos |
| `STORAGE_LOCAL_DIR` | Directorio local (provider `local`) |

## 9. Referencias

- `docs/ADR-012-storage-r2.md` — por qué R2 y no `/uploads` en Express.
- `docs/ADR-013-presigned-uploads.md` — por qué upload directo vía presigned.
- `docs/ECOMMERCE-DATA-FLOW.md` — flujo extremo a extremo.
- `docs/PRODUCT-IMAGES-MIGRATION.md` — migración de assets históricos.
- `docs/SYSTEM-MODELING.md` §6 — contexto de arquitectura.
