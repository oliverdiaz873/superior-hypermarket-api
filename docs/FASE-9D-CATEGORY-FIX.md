# Documentación Fase 9D - Corrección de Filtrado de Productos por Categoría y Subcategoría

## 1. Problema Encontrado
Al navegar a rutas de subcategoría (ej. `/category/alimentos/frutas-y-verduras` en Angular o `/es/category/alimentos/frutas-y-verduras` en Next.js), las aplicaciones no mostraban productos o respondían con errores de navegación (HTTP 404), a pesar de existir productos semilla activos vinculados a dichas subcategorías.

---

## 2. Evidencia del Diagnóstico
* **Diagnóstico Backend**: La API en Express + MongoDB expone la búsqueda de productos `/api/products?category=<slug>` filtrando por `category.slug`. Los datos persistidos en la base de datos almacenan los productos vinculados directamente a la categoría hoja (`category.slug = "frutas-y-verduras"`, `category.slug = "tablets"`, `subcategoryId = null`).
* **Diagnóstico Angular**: `product.service.ts` ejecutaba `fetchAllProductsInCategory(category.id, sub.slug)`, generando la consulta `/api/products?category=alimentos&subcategoryId=frutas-y-verduras`. El backend filtraba por la intersección de ambas propiedades resultando en `0` productos.
* **Diagnóstico Next.js**: `CategoryPage` en `[locale]/(shop)/category/[id]/page.tsx` llamaba a `getAllCategoryProducts(category.id, 100, locale, slug)`, enviando también la categoría padre `"alimentos"` y devolviendo `0` productos. Además, la resolución de subcategorías dependía del orden y filtrado exacto de `visibleSubcategories`.

---

## 3. Causa Raíz
1. **Modelado en Base de Datos**: Los productos se persisten asignando el slug de la categoría hoja en `category.slug` (`frutas-y-verduras`, `tablets`, etc.), sin utilizar la categoría raíz de primer nivel (`alimentos`, `tecnologia`) ni el campo auxiliar `subcategoryId`.
2. **Desalineación de Parámetros de Consulta**: Ambos storefronts enviaban la categoría raíz (`alimentos`) como el parámetro `category` y el slug de subcategoría en `subcategoryId`. Al consultar la API backend, el filtro estricto por ambos campos no encontraba ningún documento.

---

## 4. Corrección Aplicada en Angular
* **Archivo Modificado**: `src/app/features/products/services/product.service.ts`
* **Cambio**: En `loadCategorySections(category: Category)`, se simplificó la llamada a `fetchAllProductsInCategory` para transmitir únicamente el slug hoja de la subcategoría:
  ```typescript
  // Antes:
  this.fetchAllProductsInCategory(category.id, sub.slug).subscribe(...)

  // Corrección:
  this.fetchAllProductsInCategory(sub.slug).subscribe(...)
  ```

---

## 5. Corrección Aplicada en Next.js
* **Archivo Modificado**: `src/app/[locale]/(shop)/category/[id]/page.tsx`
* **Cambio**: En `CategoryPage`, la obtención de productos para cada subcategoría utiliza directamente el slug de la categoría hoja:
  ```typescript
  // Antes:
  const rawProducts = await getAllCategoryProducts(category.id, 100, locale, slug);

  // Corrección:
  const rawProducts = await getAllCategoryProducts(slug, 100, locale);
  ```

---

## 6. Evidencia de Validación
* **Angular Storefront**:
  * `/category/alimentos` -> Renderiza todas las secciones con productos.
  * `/category/alimentos/frutas-y-verduras` -> Muestra los productos de Frutas y Verduras.
  * `/category/tecnologia/tablets` -> Muestra los productos de Tablets.
  * `ng build --configuration=development` -> Compilación exitosa (0 errores de compilación).
* **Next.js Storefront**:
  * `http://localhost:3001/es/category/alimentos` -> HTTP 200 OK
  * `http://localhost:3001/es/category/alimentos/frutas-y-verduras` -> HTTP 200 OK (productos visibles en carruseles)
  * `http://localhost:3001/es/category/tecnologia/tablets` -> HTTP 200 OK (productos visibles en carruseles)
  * `http://localhost:3001/es/category/alimentos/invalid-sub` -> Renderiza la página not-found como corresponde.

---

## 7. Confirmación de Alcance y No Mutación Externa
* **Backend Express**: Sin modificaciones.
* **Modelos Mongoose y Base de Datos**: Sin modificaciones.
* **Seeds y Scripts de Migración**: Sin modificaciones.
* **Tests de Integración y Unitarios**: Intactos y sin cambios.
