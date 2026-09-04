# Hypermarket API Contract

Documento que define la comunicación entre:
- **Angular frontend**
- **Next.js frontend**
- **Express + TypeScript backend**

---

## 1. API General

| Propiedad | Valor |
|-----------|-------|
| **Base URL (dev)** | `http://localhost:3000/api` |
| **Base URL (prod)** | `https://api.hipermercadosuperior.com/api` |
| **Formato** | JSON |
| **Autenticación** | JWT |

---

## 2. Convenciones

### Naming

La API utiliza nombres en **inglés** para todos los campos.

```json
{
  "price": 80,
  "image": "products/arroz.jpg",
  "category": { "name": "Despensa", "slug": "despensa" }
}
```

### Arquitectura Interna

Cada módulo sigue el flujo:

```
Request
  ↓
Route        → Define el endpoint
  ↓
Controller   → Maneja HTTP (req, res)
  ↓
Service      → Lógica de negocio
  ↓
Repository   → Acceso a datos
  ↓
Database     → MongoDB (futuro)
```

> **Stack**: Node.js + Express + TypeScript (strict mode)
> **Estado**: Migración de JavaScript a TypeScript completada ✅

---

## 3. Response Format

Todas las respuestas exitosas:

```json
{
  "success": true,
  "data": {}
}
```

**Ejemplo GET /products:**

```json
{
  "success": true,
  "data": [
    {
      "id": "arroz-superior",
      "sku": "ARROZ-001",
      "name": "Arroz Superior",
      "description": "Arroz superior de grano largo.",
      "price": 80,
      "image": "https://cdn.hipermercadosuperior.com/products/arroz-superior/68f1-9c2d-4a7b.webp?v=2026-08-08T10:00:00.000Z",
      "categoryId": "alimentos",
      "category": { "name": "Despensa", "slug": "despensa" },
      "brandId": "alguna",
      "brand": { "name": "Marca", "slug": "marca" },
      "unit": "kg",
      "unitQuantity": 1,
      "status": "active",
      "isAvailable": true
    }
  ]
}
```

> `imageKey`, `imageThumbnailKey` y `translations` son **internos del backend** y
> no se exponen en las respuestas públicas. Los frontends consumen únicamente
> `image` (URL pública). El `name`/`description` devueltos ya están localizados
> según `?lang=` (fallback al idioma raíz). El catálogo público solo lista
> productos que cumplen **ambas** condiciones: `status: "active"` **y**
> `isAvailable: true`.

---

## 4. Error Format

```json
{
  "success": false,
  "message": "Product not found",
  "statusCode": 404
}
```

| Código | Significado |
|--------|-------------|
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 409 | Conflict (ej. stock insuficiente, email duplicado) |
| 429 | Too Many Requests (rate limit) |
| 500 | Internal Server Error |

---

## 5. Products API

Los productos pueden incluir `subcategoryId` además de `categoryId`. Cuando se
envía, el backend valida que la subcategoría pertenezca a la categoría indicada
y responde `400` ante una combinación inválida. Productos legacy pueden tener
`subcategoryId: null`. Los filtros públicos y administrativos aceptan
`categoryId` y `subcategoryId`.

### GET /products

Obtiene los productos disponibles públicamente.

**Query params:**
- `category` → filtrar por categoría (slug de categoría o subcategoría)
- `page` → número de página (default 1)
- `limit` → items por página (default 50, máx 100)
- `q` → búsqueda por término (nombre/sku)
- `status` → aceptado por compatibilidad, pero **no amplía el catálogo público**:
  la consulta pública fuerza siempre `status: "active"` + `isAvailable: true`.
- `lang` → `es | en` (localiza `name`/`description` desde `translations`; fallback al idioma raíz/es)
- `sortBy` → `name | price | createdAt | updatedAt`
- `sortOrder` → `asc | desc`

El catálogo público **solo muestra productos con `status: "active"` y
`isAvailable: true`** (drafts e inactivos quedan ocultos). `?status=inactive`
devuelve una lista vacía porque el filtro de visibilidad se aplica siempre; el
parámetro no puede exponer productos no activados.

**Response:**

```json
{
  "success": true,
  "data": [ /* Product[] */ ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 184,
    "pages": 4
  }
}
```

> La lista paginada devuelve `data` (array) + `pagination` (`page`, `limit`,
> `total`, `pages`) como objetos separados.

### GET /products/:id

Obtiene un producto específico (solo si `status: "active"` **y** `isAvailable: true`).

**Query params:**
- `lang` → `es | en` (localiza `name`/`description`; fallback al idioma raíz)

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "arroz-superior",
    "sku": "ARROZ-001",
    "name": "Arroz Superior",
    "description": "Arroz superior de grano largo.",
    "price": 80,
    "image": "https://cdn.hipermercadosuperior.com/products/arroz-superior/68f1-9c2d-4a7b.webp?v=2026-08-08T10:00:00.000Z",
    "categoryId": "alimentos",
    "category": { "name": "Despensa", "slug": "despensa" },
    "unit": "kg",
    "unitQuantity": 1,
    "status": "active",
    "isAvailable": true
  }
}
```

**Error:** si el producto no existe o no está disponible públicamente (debe
cumplir `status: "active"` **y** `isAvailable: true`):

```json
{
  "success": false,
  "message": "Product not found",
  "statusCode": 404
}
```

### POST /products (admin)

Crea un producto **draft**. Requiere `Authorization: Bearer <token>` con rol `admin`.

**Body:**

```json
{
  "name": "Leche Entera",
  "sku": "LECHE-001",
  "description": "Leche entera pasteurizada.",
  "price": 120,
  "categoryId": "lacteos",
  "brandId": "marca-x",
  "unit": "litro",
  "unitQuantity": 1,
  "translations": {
    "es": { "name": "Leche Entera", "description": "Leche entera pasteurizada." },
    "en": { "name": "Whole Milk", "description": "Pasteurized whole milk." }
  }
}
```

Comportamiento:

- La imagen es **opcional** y se confirma después mediante `PATCH`.
- El producto se crea como `status: "inactive"` y `isAvailable: false`.
- Confirmar imagen **no activa** el producto: la activación es explícita vía `PATCH`.
- `translations` es opcional; si falta, se usa `name`/`description` raíz como
  valor por defecto para ambos idiomas.
- El contrato de creación acepta `translations` con `es` **y** `en` (F4 no
  redefine el contrato histórico: los dos idiomas pueden crearse). La edición
  administrativa posterior es la que queda limitada a `en` (ver
  `PATCH /admin/products/:id`).

**Response:** `201 { success: true, data: Product }` (`data.image` será `null` hasta
que se confirme una imagen).

**Errores:** `400` validación · `401` no autenticado · `403` sin rol admin · `409` SKU duplicado.

### PATCH /products/:id (admin)

Actualización parcial. Requiere rol `admin`.

- Campo `imageKey` (confirmación de imagen): recibe una key emitida por el
  presign — `products/{productId}/{uuid}.{ext}`. El backend:
  1. valida que la key sea segura;
  2. comprueba que pertenece al producto (`products/{id}/...`);
  3. verifica que el objeto existe en storage;
  4. valida contenido best-effort (magic bytes local / HEAD en R2);
  5. actualiza MongoDB (`imageKey` + `image` pública);
  6. elimina la imagen anterior **después** de que Mongo confirme (si esta falla,
     la imagen anterior sigue vigente).
- Campos `status` / `isAvailable`: activación explícita del producto
  (`PATCH { status: "active", isAvailable: true }`).
- `brandId: null` limpia la marca.

> Este endpoint conserva el contrato existente: la **respuesta** es pública
> (sin `imageKey`, `imageThumbnailKey` ni `translations`). El boundary editorial
> con `translations`/keys vive en `PATCH /admin/products/:id`.

**Response:** `200 { success: true, data: Product }` (sin `imageKey` ni `translations`).

### DELETE /products/:id (admin)

Elimina un producto (físico). Requiere rol `admin`.

- Borra el documento en MongoDB, el inventario asociado y el prefijo
  `products/{id}/` en storage (`deletePrefix`, best-effort).
- Los huérfanos que queden tras un fallo se recuperan con `npm run cleanup:orphans`.

**Response:** `204` sin cuerpo.

---

## 5bis. Admin Products API (`/api/admin/products`)

Requiere rol `admin` (Bearer token). Boundary editorial del Dashboard: devuelve
`translations` (solo `en`), `imageKey` e `imageThumbnailKey`, campos que la API
pública jamás expone.

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/admin/products` | Lista paginada (filtra por `status`, `q`, `category`, `brand`, `isAvailable`) |
| GET | `/api/admin/products/:id` | Detalle administrativo (404 si no existe) |
| PATCH | `/api/admin/products/:id` | Edición (merge no destructivo), incluyendo `translations.en` |

**Lista:** acepta los mismos query params que `GET /products` (`page`, `limit`,
`sortBy`, `sortOrder`, `q`, `category`, `brand`) más `status` (`active | inactive`)
e `isAvailable` (`true`). Incluye drafts e inactivos (son visibles solo aquí).

**PATCH body de traducciones (script)**:

```json
{
  "name": "Café Premium",
  "translations": {
    "en": { "name": "Premium Coffee", "description": "..." }
  }
}
```

- `translations.en` → editable con **merge no destructivo**: los campos `name`/
  `description` que no se envíen conservan su valor existente; `name` de `en`
  nunca puede quedar vacío.
- `translations.es` **no es administrable** en F4: se rechaza con `400`
  (`Unsupported translation language(s)`). El ES editorial vive en los campos
  raíz `name`/`description`.
- El resto de campos (status, precio, imagen `imageKey`, brand, etc.) comparte
  el flujo de `PATCH /products/:id`.

**Response:** `200 { success: true, data: AdminProduct }`, donde `AdminProduct`
es `Product` más `imageKey`, `imageThumbnailKey` y `translations.en`.

**Errores:** `400` validación (incl. `translations.es`) · `401` no autenticado ·
`403` sin rol admin · `404` producto inexistente.

---

### POST /admin/uploads/presigned (admin)

Solicita una URL firmada para subir una imagen directamente al storage (R2 en
producción / local en dev). El `productId` **no se genera aquí**: lo aporta el
cliente, ya creado previamente con `POST /api/products`.

**Body:**

```json
{
  "productId": "8f3a-1234-...",
  "fileName": "coca-cola.webp",
  "contentType": "image/webp",
  "purpose": "product"
}
```

- `purpose: "product"` requiere `productId`; la key generada es
  `products/{productId}/{uuid}.{ext}` versionada e inmutable.
- `purpose: "pending"` (opcional, upload en curso sin confirmar) genera
  `pending/{uuid}.{ext}`.

**Response:**

```json
{
  "success": true,
  "data": {
    "productId": "8f3a...",
    "key": "products/8f3a.../9c2d-4a7b-68f1.webp",
    "uploadUrl": "https://...presigned-put-url",
    "publicUrl": "https://cdn.hipermercadosuperior.com/products/8f3a.../9c2d-4a7b-68f1.webp",
    "expiresInSeconds": 600,
    "purpose": "product"
  }
}
```

- `uploadUrl` expira en 10 minutos (600 s).
- MIME permitidos: `image/jpeg`, `image/png`, `image/webp`, `image/avif`, `image/gif`.
- Tamaño máximo: 5 MB (validado en storage local).
- La existencia del producto se valida en el flujo de confirmación (`PATCH`),
  no en el presign.

**Errores:** `400` MIME/tamaño inválido o `productId` ausente para `product` · `401` no autenticado · `403` sin rol admin · `429` rate limit.

---

## 6. Categories API

### GET /categories

Obtiene todas las categorías con subcategorías.

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "alimentos",
      "name": "Alimentos",
      "subcategories": [
        { "name": "Frutas y Verduras", "slug": "frutas-y-verduras" },
        { "name": "Despensa", "slug": "despensa" }
      ]
    }
  ]
}
```

---

## 7. Offers API

### GET /offers

Obtiene productos con descuento activo. Comportamiento F2:
- **Visibilidad:** solo productos con `status: "active"` **y** `isAvailable: true`
  (drafts e inactivos nunca aparecen, igual que `GET /products`).
- **i18n:** `?lang=es|en` localiza `name` con fallback al idioma raíz (mismo
  mecanismo que Products/Search). No se expone el bloque `translations`.
- **Imagen:** `image` es la URL pública con cache-bust (`?v=`), resuelta por el
  mismo serializer público; jamás se exponen `imageKey`/`imageThumbnailKey`.
- **Presentación:** `priceLabel` y el formateo de precios **no se emiten**; son
  responsabilidad del consumidor (Angular/Next.js).

**Query params:**
- `lang` → `es | en` (localiza `name`; fallback al idioma raíz)

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "manzanas_verdes",
      "name": "Manzanas verdes por libras",
      "price": 45,
      "originalPrice": 56,
      "discountPrice": 45,
      "discountPercentage": 20,
      "image": "https://cdn.hipermercadosuperior.com/products/manzanas_verdes/a1b2.webp?v=2026-08-08T10:00:00.000Z",
      "categoryId": "frutas-y-verduras",
      "unit": "lb",
      "unitQuantity": 1
    }
  ]
}
```

> `price` es el precio final (`discountPrice`). `categoryId` es el id de la
> categoría del producto. `originalPrice`, `discountPrice` y
> `discountPercentage` son **números**, no strings. `image` puede ser `null`
> si el producto no tiene imagen resoluble.

### GET /api/admin/offers (admin)

Requiere `Authorization: Bearer <token>` con rol `admin`. Lista **todas** las ofertas (activas, inactivas y expiradas) con el nombre del producto resuelto para el Dashboard (`productName`).

**Response (`AdminOffer`):**

```json
{
  "success": true,
  "data": [
    {
      "id": "6a90c8fe-...",
      "productId": "58c36965-...",
      "productName": "Manzanas verdes por libras",
      "originalPrice": 56,
      "discountPrice": 45,
      "startDate": "2026-08-08T10:00:00.000Z",
      "endDate": null,
      "isActive": true,
      "title": "Mi oferta"
    }
  ]
}
```

> **Ofertas huérfanas:** si `productId` referencia un producto eliminado por *soft delete* (`isDeleted:true`), `productRepository.findByIds()` lo excluye y `listAll()` resuelve `productName` como `"Producto eliminado"` (`src/modules/offers/services/offer.service.ts:38` `?? "Producto eliminado"`). El listado administrativo conserva la oferta por trazabilidad; el público `GET /api/offers` la filtra (`src/modules/offers/services/offer.service.ts:48` `!product || !isPubliclyVisible → null`). Ver `docs/OFFERS-LIFECYCLE.md` para ciclo de vida completo y consideraciones futuras.

---

## 8. Search API

Busca productos por término. El filtro de visibilidad es el mismo que `GET /products`:
**solo** productos con `status: "active"` **y** `isAvailable: true` (drafts e
inactivos nunca aparecen) y la respuesta pasa por el **mismo serializer público**
(aplicado `?lang=` con fallback, y sin `imageKey`/`imageThumbnailKey`/`translations`).

**Query params:**
- `q` → término de búsqueda (requerido)
- `category` → filtrar por categoría (opcional)
- `lang` → `es | en` (localiza `name`/`description`; fallback al idioma raíz)

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "arroz-superior",
      "sku": "ARROZ-001",
      "name": "Arroz Superior",
      "price": 80,
      "image": "https://cdn.hipermercadosuperior.com/products/arroz-superior/68f1-9c2d-4a7b.webp?v=2026-08-08T10:00:00.000Z",
      "categoryId": "alimentos",
      "category": { "name": "Despensa", "slug": "despensa" }
    }
  ]
}
```

> Devuelve la misma estructura de producto que `GET /products` (ver sección 5).

---

## 9. Pagination

Ya implementada en `GET /products` (ver sección 5). `page` (default 1) y
`limit` (default 50, máx 100) via query params; la respuesta devuelve
`pagination` junto a `data`:

```json
GET /products?page=1&limit=20
```

**Response:**

```json
{
  "success": true,
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 184,
    "pages": 10
  }
}
```

> `page` se clampa a ≥1 y `limit` a [1, 100]. `GET /offers` y `GET /categories`
> devuelven listas planas sin paginación.

---

## 10. Orders API

Todos los endpoints de órdenes requieren autenticación (Bearer token).

### POST /orders

Crea una orden a partir del carrito actual. La dirección se guarda como **snapshot** (`shippingAddress`), no como referencia, para preservar la historia de la compra.

**Request body:**
| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| addressId | string | Sí | ID de la dirección del usuario |

**Comportamiento:**
1. Obtener carrito
2. Validar dirección (snapshot → `shippingAddress`)
3. Obtener productos actuales
4. Validar stock (`availableStock >= quantity` por ítem)
5. Crear la orden con snapshot de precio/nombre/imagen/cantidad
6. `decreaseStock()` atómico por producto
7. Vaciar carrito

> Si falla una operación de inventario a mitad del ciclo, se compensa con `restoreStock()` (best-effort, Mongo standalone sin transacciones).

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "string",
    "items": [{ "productId": "string", "name": "string", "price": "number", "image": "string", "quantity": "number" }],
    "shippingAddress": {
      "label": "string",
      "street": "string",
      "city": "string",
      "state": "string",
      "zipCode": "string",
      "country": "string",
      "reference": "string"
    },
    "totalItems": "number",
    "subtotal": "number",
    "status": "pending",
    "paymentStatus": "pending",
    "createdAt": "date",
    "updatedAt": "date"
  }
}
```

### PATCH /orders/:id/status

Actualiza el estado de la orden **del propio usuario** (customer). Transición válida para el customer:
- `pending` → `cancelled` (cualquier otra transición responde `400`)

Al transicionar a `cancelled` se restaura el stock de todos los ítems (`restoreStock`).

### Admin Orders API (`/admin/orders`)

Requiere rol `admin` (Bearer token).

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/admin/orders` | Todas las órdenes, ordenadas por `createdAt` desc |
| GET | `/admin/orders/:id` | Detalle de una orden (404 si no existe) |
| PATCH | `/admin/orders/:id/status` | Cambia el estado de una orden |

**Transiciones válidas para admin:**
- `pending` → `processing` | `cancelled`
- `processing` → `completed` | `cancelled`

Al transicionar a `cancelled` se restaura el stock de todos los ítems (`restoreStock`).

**PATCH request body:** `{ "status": "processing" }`

---

## 11. Addresses API

Todos los endpoints de direcciones requieren autenticación (Bearer token) y están scoped al usuario autenticado.

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/addresses` | Direcciones del usuario autenticado |
| GET | `/addresses/:id` | Dirección por ID (owner o admin) |
| GET | `/addresses/user/:userId` | Direcciones de un usuario (admin o el propio usuario; si no, `403`) |
| POST | `/addresses` | Crea dirección (`label, street, city, state, zipCode, country` requeridos) |
| PATCH | `/addresses/:id` | Actualiza dirección (owner). `isDefault: true` desactiva la anterior |
| DELETE | `/addresses/:id` | Elimina dirección (owner) |

Regla: **una sola `isDefault` por usuario**. La primera dirección de un usuario es default automáticamente.

---

## 12. Inventory API

API **privada** (solo admin). La disponibilidad pública del producto se resuelve mediante la **Product API**; el inventario interno no se expone a clientes.

| Método | Endpoint | Rol | Descripción |
|--------|----------|-----|-------------|
| GET | `/inventory` | admin | Todos los registros |
| GET | `/inventory/:id` | admin | Registro por ID |
| GET | `/inventory/product/:productId` | admin | Registro por producto |
| GET | `/inventory/low-stock` | admin | Stock bajo (`stock <= minStock`) |
| PATCH | `/inventory/:id` | admin | Ajusta `stock` y/o `minStock` |

Todos los registros incluyen **`availableStock = stock - reservedStock`** (campo virtual calculado, nunca persistido).

`GET /inventory/product/:productId` responde `404 { success: false, message: "Inventory not found", statusCode: 404 }` si el producto no tiene registro de inventario.

---

## 13. Contact API

| Método | Endpoint | Autenticación | Descripción |
|--------|----------|---------------|-------------|
| POST | `/contact` | pública | Envía mensaje de contacto |

**Request body:** `{ name, email, message }` + `phone?`

El mensaje se guarda con `status: "pending" | "read" | "answered"` (default `pending`).

### Admin Contact API (`/admin/contact`)

Requiere rol `admin` (Bearer token).

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/admin/contact` | Todos los mensajes, ordenados por `createdAt` desc |
| GET | `/admin/contact/:id` | Detalle de un mensaje (404 si no existe) |
| PATCH | `/admin/contact/:id` | Cambia el `status` del mensaje |
| DELETE | `/admin/contact/:id` | Elimina el mensaje (204) |

**Transiciones de status válidas:** `pending` → `read` | `answered`, `read` → `answered` (cualquier otra responde `400`).

**PATCH request body:** `{ "status": "read" }`

**Rate limit:** el endpoint público está limitado a **10 peticiones por minuto por IP**. Al exceder el límite responde `429`.

| Status | Mensaje |
|--------|---------|
| 429 | Too many messages, please try again later |

---

## 14. Admin Stats API (`/admin/stats`)

Requiere rol `admin` (Bearer token).

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/admin/stats` | Métricas agregadas para el dashboard (KPIs) |

**Response shape:**

```json
{
  "success": true,
  "data": {
    "summary": {
      "totalOrders": 0,
      "grossRevenue": 0,
      "averageOrderValue": 0,
      "completedOrders": 0,
      "totalCustomers": 0,
      "totalProducts": 0,
      "lowStockCount": 0,
      "pendingContactMessages": 0
    },
    "ordersByStatus": { "pending": 0, "processing": 0, "completed": 0, "cancelled": 0 },
    "revenue": { "gross": { "today": 0, "week": 0, "month": 0 } }
  }
}
```

**Definiciones:**

- `grossRevenue`: suma del `subtotal` de **todas** las órdenes creadas, **incluyendo canceladas** (facturación bruta, no ganancia).
- `revenue.gross`: facturación bruta por ventana de tiempo — `today` (desde inicio del día UTC), `week` (últimos 7 días), `month` (últimos 30 días).
- `averageOrderValue`: `grossRevenue / completedOrders` (subtotal de todas las órdenes dividido entre las órdenes `completed`). Es `0` si `completedOrders === 0`.
- `completedOrders`: número de órdenes con status `completed`.
- `lowStockCount`: registros de inventario con `minStock` definido y `stock <= minStock` (misma regla que `GET /inventory/low-stock`).
- `pendingContactMessages`: mensajes de contacto con status `pending`.

---

## 15. Cart, Brands y Auth (Read-only / provisional contract)

> **Etiqueta:** `Read-only / provisional contract` — **no hay cambios de
> comportamiento en F2.** Estos endpoints existen en el backend pero todavía
> no se consumen desde los storefronts (Angular/Next.js en modo mock). Su
> contrato se documenta tal como está hoy para que el diseño F2 no asuma
> supuestos; cualquier modificación será Fase posterior con su propia revisión.

### GET /api/cart

Requiere `Authorization: Bearer <token>` (rol `customer`). Shape actual:

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "productId": "64b...",
        "name": "Arroz 1kg",
        "price": 80,
        "quantity": 2,
        "image": "https://cdn.hipermercadosuperior.com/products/...?v=..."
      }
    ],
    "totalItems": 2,
    "subtotal": 160,
    "createdAt": "2026-08-08T10:00:00.000Z",
    "updatedAt": "2026-08-08T10:00:00.000Z"
  }
}
```

### GET /api/brands

Lista plana de marcas (`id`, `name`, `slug`, `description?`, `logo?`, `status`)
**público y sin filtro** (devuelve el conjunto completo tal como está hoy).

### POST /api/auth/login · POST /api/auth/register · GET /api/auth/me

Autenticación con JWT. El contrato exacto (payload, expiración, roles) se
define en su fase de integración; aquí solo se documenta su existencia.

---

## 16. Versioning (decisión actual)

**Decisión (ADR-015):** se mantiene `/api` **sin versionado** por ahora. La
transición hacia un prefijo versionado (p. ej. `/api/v1`) se evaluará cuando
exista un cambio de contrato rompedor. Documentado en
`docs/ADR-015-api-versioning-policy.md`.

```
/api/products        → hoy
/api/v1/products     → futuro (solo si hay breaking change)
```
