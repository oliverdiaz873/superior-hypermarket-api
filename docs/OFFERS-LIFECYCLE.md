# Ciclo de Vida de Ofertas y Productos Eliminados

> **Ámbito:** `superior-hypermarket-api` — módulo `offers` / `products`  
> **Relacionados:** `docs/API-CONTRACT.md#7`, `docs/SYSTEM-MODELING.md#3.7`, `docs/PRODUCTION-DATA-PROTECTION.md#Soft-delete`

---

## 1. Comportamiento esperado

Una oferta (`Offer`) puede permanecer almacenada aunque su producto asociado haya sido eliminado mediante *soft delete*.

* **Dashboard administrativo (`GET /api/admin/offers`):** la oferta sigue visible. El campo `productName` se resuelve como `"Producto eliminado"` cuando el `productId` ya no existe en la consulta de productos. Esto permite identificar y gestionar ofertas históricas/huérfanas sin romper el listado.
* **Ejemplo observado:** `Mi oferta` → `Producto eliminado` en `src/features/offers/components/offers-table` (`dashboard/src/features/offers/components/offers-table/offers-table.component.ts:49`).
* **Intención:** preservar integridad histórica y visibilidad administrativa; el listado no falla por una referencia rota.

## 2. Comportamiento público vs administrativo

| Canal | Endpoint | Visibilidad de oferta huérfana | Fundamento |
|-------|----------|--------------------------------|------------|
| **Admin** | `GET /api/admin/offers` `src/modules/offers/services/offer.service.ts:30 listAll()` | **Visible** con `productName: "Producto eliminado"` | `listAll()` hace `findAllSorted()` + `productRepository.findByIds()` (filtra `isDeleted`) + fallback `?? "Producto eliminado"` `:38`. |
| **Público** | `GET /api/offers?lang=` `src/modules/offers/services/offer.service.ts:42 getAll()` | **No visible** (filtrada) | `getAll()` hace `findById(productId)` + `isPubliclyVisible(product)` `:48-49` (`status:"active" && isAvailable:true` `src/modules/products/presenters/product.presenter.ts:64`). Si `!product` o no visible → `return null` → `filter(Boolean)`. |

El storefront (`Next` `src/lib/api-client.ts:getOffers` / `fetchOffers` y `Angular`) nunca muestra al cliente una oferta cuyo producto fue eliminado o desactivado.

## 3. Motivo técnico

1. **Soft delete de productos:** `src/shared/plugins/soft-delete.plugin.ts` añade `isDeleted` / `deletedAt` e inyecta filtro automático en `find`, `findOne`, `countDocuments`, etc. `src/modules/products/repositories/product.repository.ts:78 findByIds` y `:73 findById` respetan ese filtro.
2. **Creación de oferta valida producto existente:** `src/modules/offers/services/offer.service.ts:92` `findById(productId)` → `NotFoundError` si no existe.
3. **Eliminación de producto no cascada:** `src/modules/products/services/product.service.ts:396 remove()` ejecuta `softDeleteById(id)` sin tocar `offerRepository`. `src/modules/offers/services/offer.service.ts:201 remove()` solo hace `softDeleteById` de la oferta. No existe `updateMany` de ofertas al eliminar producto.
4. **Fallback administrativo:** `offer.service.ts:38` `nameByProduct.get(offer.productId) ?? "Producto eliminado"` evita `undefined` y mantiene la tabla funcional (`dashboard/src/features/offers/models/offer.model.ts:8 productName: string`).

## 4. Ejemplo de ciclo de vida

```
1. Crear producto
   POST /api/products { name:"Café", price:100, categoryId:"alimentos" } → 201

2. Crear oferta asociada
   POST /api/offers { productId:"<id café>", originalPrice:100, discountPrice:80 } → 201

3. Eliminar producto (soft delete)
   DELETE /api/products/:id (admin) → 204
   ProductModel softDelete → isDeleted:true, deletedAt:Date
   OfferModel intacta → isDeleted:false

4. Oferta permanece almacenada

5. Dashboard → GET /api/admin/offers
   → { id:"...", title:"Mi oferta", productId:"<id café>", productName:"Producto eliminado" }

6. API público → GET /api/offers?lang=es
   → oferta filtrada (0 resultados para ese productId) → no visible en storefront
```

La colección `offers` conserva `productId` huérfano; la resolución del nombre es *lazy* en `listAll()`.

## 5. Consideraciones futuras (no bug, decisión de arquitectura/producto)

El comportamiento actual es **esperado y documentado**, no un defecto. Futuras decisiones pueden evaluarse sin carácter obligatorio:

* **Desactivación automática:** al `softDelete` de un producto, `updateMany({productId}, {isActive:false})` en `offers`.
* **Eliminación en cascada (soft):** `softDeleteById` de ofertas asociadas.
* **Política de retención:** mantener huérfanas por auditoría/histórico vs limpieza periódica (`cleanup:orphans`).
* **Validación en Dashboard:** advertir al crear oferta si el producto está próximo a ser descontinuado.

Cualquier cambio debe preservar la distinción **admin (histórico) vs público (visible)** y la regla `isPubliclyVisible`.

## 6. Referencias

* `superior-hypermarket-api/src/modules/offers/services/offer.service.ts:30,42,92,201`
* `superior-hypermarket-api/src/modules/products/repositories/product.repository.ts:73,78`
* `superior-hypermarket-api/src/modules/products/services/product.service.ts:396`
* `superior-hypermarket-api/src/shared/plugins/soft-delete.plugin.ts`
* `superior-hypermarket-dashboard/src/features/offers/models/offer.model.ts:5`
* `superior-hypermarket-dashboard/src/features/offers/components/offers-table/offers-table.component.ts:49`
* `docs/API-CONTRACT.md#7` y `docs/SYSTEM-MODELING.md#3.7`

---
*Última actualización: 2026-08-29 — documentado como comportamiento esperado, sin modificación de código.*
