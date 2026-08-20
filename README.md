# superior-hypermarket-api

Backend del hypermarket con Node.js + Express + TypeScript utilizando **Feature-Based Architecture**.

> Migración de JavaScript a TypeScript completada ✅

## System Architecture

Este repositorio es la **Backend API (API central)** del ecosistema **Hipermercado
Superior**. Es consumida por los tres clientes del sistema: los dos storefronts de
clientes y el panel administrativo.

```
                    Hipermercado Superior Ecosystem

        superior-hypermarket-api
                         Express REST API
                                  |
        -----------------------------------------------------------------
        |                           |                            |
        |                           |                            |
superior-hypermarket-    superior-hypermarket-      superior-hypermarket-
storefront-next          storefront-angular         dashboard

   Next.js Storefront         Angular Storefront      Angular Admin Dashboard
      (Customer App)            (Customer App)              (Admin App)
                                  |
                                  ▼
                             MongoDB

                  superior-hypermarket-e2e (Playwright)
                  E2E central que valida el ecosistema completo
```

| Repository | Type | Technology | Purpose |
|------------|------|------------|---------|
| superior-hypermarket-api | Backend API | Express + MongoDB + JWT | API central del sistema |
| superior-hypermarket-storefront-next | Customer Frontend | Next.js + React | Tienda pública |
| superior-hypermarket-storefront-angular | Customer Frontend | Angular | Tienda pública alternativa |
| superior-hypermarket-dashboard | Admin Frontend | Angular + Material + NgRx Signals | Panel administrativo |
| superior-hypermarket-e2e | E2E Harness | Playwright | Infraestructura E2E central del ecosistema |

### Centralized E2E Harness

`hypermarket-superior-e2e` es el repositorio independiente de pruebas
**End-to-End (Playwright)** del ecosistema. No contiene lógica de negocio: es
infraestructura de validación que orquesta y valida varios repositorios a la
vez, probando flujos completos (frontend → backend → persistencia → dashboard)
y centralizando fixtures, helpers, configuración y specs E2E.

[Centralized E2E Harness - hypermarket-superior-e2e](https://github.com/oliverdiaz873/hypermarket-superior-e2e)

### Consumed by

Esta API es consumida por:

- **Next.js storefront** — `superior-hypermarket-storefront-next`
- **Angular storefront** — `superior-hypermarket-storefront-angular`
- **Angular admin dashboard** — `superior-hypermarket-dashboard`

### Flujo de comunicación

```
Storefronts (Next · Angular) · Admin Dashboard
        │
        ▼
superior-hypermarket-api (Express REST API)
        │
        ▼
MongoDB
```

## Arquitectura

```
src/
├── modules/       # Módulos de negocio (features)
│   ├── products/  # Gestión de productos
│   ├── categories/# Gestión de categorías
│   ├── offers/    # Gestión de ofertas
│   ├── search/    # Búsqueda de productos
│   ├── users/     # Gestión de usuarios
│   ├── cart/      # Carrito de compras
│   ├── orders/    # Pedidos
│   └── auth/      # Autenticación
├── shared/        # Código transversal reutilizable
│   ├── middleware/ # Middlewares globales (logger, cors, validación, errores)
│   │   ├── error-handler.ts       # Manejo centralizado de errores
│   │   ├── logger.middleware.ts   # Registro de peticiones HTTP
│   │   └── validation.middleware.ts # Validación de campos requeridos
│   ├── errors/    # Clases de errores personalizados
│   ├── utils/     # Funciones utilitarias reutilizables
│   └── constants/ # Constantes globales (roles, códigos, mensajes)
├── config/        # Configuración centralizada (variables de entorno)
├── app.ts         # Configuración de Express (middlewares, rutas)
└── server.ts      # Inicio del servidor
```

## Responsabilidades

| Archivo/Carpeta | Responsabilidad |
|----------------|----------------|
| `app.ts` | Configuración de Express (middlewares, rutas) |
| `server.ts` | Inicio del servidor y puerto |
| `config/` | Configuración centralizada desde variables de entorno |
| `modules/` | Módulos de negocio independientes (features) |
| `modules/users/` | CRUD completo de usuarios con datos en memoria |
| `shared/middleware/` | Middlewares globales reutilizables |
| `shared/middleware/error-handler.ts` | Captura y responde errores de forma uniforme |
| `shared/middleware/logger.middleware.ts` | Registra método, URL, código de estado y tiempo de cada petición |
| `shared/middleware/validation.middleware.ts` | Valida campos obligatorios en el body de la petición |
| `shared/errors/` | Clases de errores personalizados |
| `shared/errors/not-found.error.ts` | Error 404 para recursos no encontrados |
| `shared/errors/email-already-exists.error.ts` | Error 409 para email duplicado |
| `shared/errors/invalid-data.error.ts` | Error 400 para datos invalidos |
| `shared/utils/` | Funciones utilitarias transversales |
| `shared/constants/` | Constantes globales (roles, códigos, mensajes) |

## Tecnologías

- Node.js
- Express
- TypeScript (strict mode)
- cors (Cross-Origin Resource Sharing)
- dotenv (variables de entorno)
- nodemon (desarrollo)
- tsx (ejecución TypeScript en desarrollo)

## Variables de entorno

Copiar `.env.example` a `.env` y configurar los valores:

| Variable | Descripción | Obligatorio |
|----------|-------------|-------------|
| `PORT` | Puerto del servidor | No (default: 3000) |
| `NODE_ENV` | Entorno (`development`, `test`, `production`) | No (default: development) |
| `CORS_ORIGIN` | Orígenes permitidos para CORS (separados por coma) | No (default: http://localhost:4200) |
| `JWT_SECRET` | Clave secreta para firmar tokens JWT | Sí |
| `JWT_EXPIRES_IN` | Tiempo de expiración del token JWT | No (default: 1d) |
| `MONGODB_URI` | Cadena de conexión a MongoDB | No (default: mongodb://localhost:27017/hypermarket) |
| `RATE_LIMIT_WINDOW_MS` | Ventana del rate limit global en ms | No (default: 900000 = 15 min) |
| `RATE_LIMIT_MAX_REQUESTS` | Nº máximo de peticiones por ventana | No (default: 300) |
| `MONGODB_BACKUP_URI` | Conexión solo para backups/restores (NUNCA usada por Express) | No |
| `BACKUP_DIR` | Directorio para los backups de MongoDB | No (default: backups) |

> **Node**: la API exige Node **≥ 22** (definido en `engines` de `package.json` y
> `.nvmrc`). El archivo `.env` (con credenciales) está en `.gitignore` y nunca se
> sube al repositorio.

## Instalación limpia

Requisitos: **Node.js ≥ 22** y una instancia de **MongoDB** accesible
(local, Atlas o Memory Server para tests).

```bash
# 1. Instalar dependencias (bloquea versiones desde package-lock.json)
npm ci

# 2. Crear la configuración local desde la plantilla
cp .env.example .env   # en Windows: copy .env.example .env

# 3. (Opcional) Verificar que compila y que la suite está verde
npm run build
npm test
```

## Arranque

```bash
npm run dev      # desarrollo con recarga en caliente (tsx watch)
npm run build    # compila a dist/ (tsc)
npm start        # producción: node dist/server.js
```

Utilidades de mantenimiento:

```bash
npm run seed          # sembrar datos de ejemplo
npm run clear         # limpiar datos
npm run migrate       # aplicar migraciones de esquema
npm run migrate:down  # revertir última migración
npm run backup        # respaldo de MongoDB
npm run restore -- <archivo.archive.gz>
```

## Middlewares

### Orden de ejecución

1. **express.json()** - Parsea el body JSON de las peticiones entrantes.
2. **express.urlencoded()** - Parsea datos de formularios URL-encoded.
3. **requestId** - Asigna un `requestId` (UUID) a cada petición, aceptando uno entrante via header `X-Request-Id` (solo UUIDs válidos).
4. **logger** - Registra cada petición con fecha, método, URL, código de estado, duración y `requestId`.
5. **cors** - Permite peticiones desde orígenes cruzados (Angular, Next.js).
6. **rateLimiter** - Limita peticiones por IP dentro de la ventana configurada.
7. **Rutas** - Enrutadores específicos de cada módulo (/api/products, /api/categories, etc.).
8. **errorHandler** - Middleware de errores que captura cualquier error no manejado y responde con el envelope uniforme.

### Logger
Ubicación: `src/shared/middleware/logger.middleware.ts`
- Registra timestamp ISO, método HTTP, URL, código de estado y tiempo de respuesta.
- Se ejecuta en cada petición antes de llegar a las rutas.

### CORS
Configurado con el paquete oficial `cors`.
- Soporta múltiples orígenes via `CORS_ORIGIN` separados por coma.
- Desarrollo: `http://localhost:4200` (Angular), `http://localhost:3000` (Next.js).
- En producción se restringirá al dominio del frontend.

### Validación
Ubicación: `src/shared/middleware/validation.middleware.ts`
- Middleware `validateRequiredFields(fields)` que verifica que los campos especificados existan en `req.body`.
- Retorna 400 Bad Request si faltan campos.

### Error Handler
Ubicación: `src/shared/middleware/error-handler.ts`
- Captura errores lanzados en rutas y middlewares.
- Mapea errores de dominio (`NotFoundError`, `InvalidDataError`, `UnauthorizedError`, ...), de Mongoose (duplicate key → 409, ValidationError/CastError → 400) y genéricos (500).
- Responde siempre con el envelope: `{ success, message, statusCode, code, requestId, stack }`.
- `code` es un identificador estable (p. ej. `NOT_FOUND`, `VALIDATION_ERROR`, `UNAUTHORIZED`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL_ERROR`).
- `requestId` se incluye cuando el middleware de request-id está presente, permitiendo correlacionar el error con los logs del servidor.
- `stack` solo se expone en `NODE_ENV=development`.
- Los errores 500 no exponen el mensaje interno en producción.

### Rate Limiting
Ubicación: `src/shared/middleware/rate-limit.middleware.ts`
- Limita el número de peticiones por IP en una ventana configurable (`RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS`).
- Responde `429` con `code: "RATE_LIMITED"` al superar el límite.
- Se desactiva automáticamente en `NODE_ENV=test` para no interferir con los tests.

### Health & Readiness
- `GET /health` — Liveness: responde `200` si el proceso está vivo (incluye versión y uptime).
- `GET /ready` — Readiness: responde `200` si MongoDB está accesible, `503` en caso contrario.
- `GET /api/health` — Se mantiene por compatibilidad con los clientes existentes.

## Autenticación

El módulo `auth/` maneja registro, inicio de sesión y verificación de tokens JWT.

### Endpoints

| Método | Ruta | Descripción | Auth |
|--------|------|-------------|------|
| POST | /api/auth/register | Registrar nuevo usuario | No |
| POST | /api/auth/login | Iniciar sesión y obtener token | No |
| GET | /api/auth/me | Obtener usuario actual | Sí (Bearer Token) |

### JWT

- Las contraseñas se hashean con `bcryptjs` antes de almacenarse.
- El token JWT incluye `id`, `email` y `role`.
- El middleware `auth.middleware` verifica tokens en rutas protegidas.
- Seed users: `oliver@email.com`, `maria@email.com`, `carlos@email.com` — todas con password `123456`.
- Configurar `JWT_SECRET` en `.env` (obligatorio en producción; ver `config/validation.ts`).

## Users API

### Endpoints

| Metodo | Ruta | Descripcion | Validaciones |
|--------|------|-------------|-------------|
| GET | /api/users | Listar todos los usuarios | - |
| GET | /api/users/:id | Obtener usuario por ID | - |
| POST | /api/users | Crear nuevo usuario | name, email, password obligatorios; email unico; password mayor a 6 caracteres |
| PATCH | /api/users/:id | Actualizar usuario parcialmente | Solo name, email, password; email unico; password mayor a 6 caracteres |
| DELETE | /api/users/:id | Eliminar usuario | - |

## Frontend Integration

Esta API está diseñada para ser consumida por múltiples frontends sin depender de ninguna tecnología específica.

```
        superior-hypermarket-api

                                  |
        --------------------------------------------------------
        |                         |                            |
        ▼                         ▼                            ▼

superior-hypermarket-   superior-hypermarket-      superior-hypermarket-
storefront-next         storefront-angular         dashboard

Customer Storefront      Customer Storefront        Admin Dashboard
```

### CORS
Configura `CORS_ORIGIN` en `.env` con los orígenes permitidos separados por coma:
```
CORS_ORIGIN=http://localhost:4200,http://localhost:3000,https://midominio.com
```

### Formato de respuestas
Todas las respuestas siguen un contrato uniforme:
- Éxito: `{ "success": true, "data": [...] }`
- Error: `{ "success": false, "message": "...", "statusCode": 400, "code": "VALIDATION_ERROR" }`
- Error (dando seguimiento): `{ "success": false, "message": "...", "statusCode": 500, "code": "INTERNAL_ERROR", "requestId": "..." }`

### Documentación detallada
Ver [`docs/API-USAGE.md`](docs/API-USAGE.md) para la documentación completa de endpoints, parámetros, ejemplos de respuesta y errores.

Otros documentos de referencia:

- [`docs/API-CONTRACT.md`](docs/API-CONTRACT.md) — Contrato uniforme de respuestas y errores.
- [`docs/FRONTEND-COMPATIBILITY.md`](docs/FRONTEND-COMPATIBILITY.md) — Matriz de compatibilidad del contrato frente a los dos storefronts (Angular y Next.js).
- [`docs/SYSTEM-MODELING.md`](docs/SYSTEM-MODELING.md) — Modelado del sistema.
- [`docs/ADR-011-module-boundaries.md`](docs/ADR-011-module-boundaries.md) — Límites entre módulos y lectura transversal de `stats`.
- [`docs/PRODUCTION-DATA-PROTECTION.md`](docs/PRODUCTION-DATA-PROTECTION.md) — Separación de credenciales, backups, migraciones y soft-delete.
- [`docs/PRODUCTION-RATE-LIMITS.md`](docs/PRODUCTION-RATE-LIMITS.md) — Rate limiting en producción (valores, limitaciones y ajustes).

## Arquitectura

Este proyecto utiliza **Feature-Based Architecture**: cada funcionalidad del negocio (products, users, cart, orders, auth) vive en su propio módulo dentro de `src/modules/`. El código compartido entre módulos se encuentra en `src/shared/`.

## Testing

Infraestructura de testing profesional con **Jest + ts-jest + MongoDB Memory Server**.

> El testing **End-to-End transversal del ecosistema** vive en el repositorio
> `hypermarket-superior-e2e` (Playwright); este repo conserva sus unit e
> integration tests (Jest + MongoMemoryServer).

### Stack

| Herramienta | Uso |
|-------------|-----|
| `jest` | Runner de tests (multi-proyecto: unit e integration) |
| `ts-jest` | Transpilación de TypeScript para Jest |
| `supertest` | Tests de endpoints HTTP (API) |
| `mongodb-memory-server` | MongoDB en memoria aislado (nunca toca la BD local ni de desarrollo) |

### Scripts

| Comando | Descripción |
|---------|-------------|
| `npm test` | Ejecuta todos los tests |
| `npm run test:unit` | Solo tests unitarios (`tests/unit/**`) |
| `npm run test:integration` | Solo tests de integración (`tests/integration/**`) con MongoDB en memoria |
| `npm run test:watch` | Modo watch |
| `npm run test:coverage` | Ejecuta tests con cobertura (reporte en `coverage/`) |

### Estructura

```
tests/
├── setup/          # Configuración global: MongoMemoryServer, conexión/limpieza BD
│   ├── global-setup.ts      # Arranca MongoMemoryServer y carga .env.test
│   ├── global-teardown.ts   # Detiene MongoMemoryServer
│   ├── unit.setup.ts        # Setup liviano (sin Mongo/Mongoose)
│   └── integration.setup.ts # Conecta, limpia colecciones y desconecta
├── unit/           # Tests unitarios (services, controllers, middleware, utils, repositories-mocks)
├── integration/    # Tests de integración (repositories, auth, products, orders, ...)
├── helpers/        # Helpers reutilizables
├── fixtures/       # Datos estáticos
├── factories/      # Factories de datos
└── utils/          # Utilidades de test
```

### Entorno de testing

- Se utiliza `.env.test` (aislado del entorno de desarrollo).
- `MONGODB_URI` se sobreescribe automáticamente con la URI de `MongoMemoryServer`.
- Cada worker de Jest usa una base única (`test_${JEST_WORKER_ID}`) dentro del memory server, por lo que los tests de integración en paralelo no se pisan entre sí.
- Cada suite de integración inicia con la base limpia (limpieza en `afterEach`).
- Configuración: `jest.config.ts` (multi-proyecto, `testEnvironment: node`, `detectOpenHandles`) y `tsconfig.test.json`.