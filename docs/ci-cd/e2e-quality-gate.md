# E2E Quality Gate

Este documento explica el Quality Gate E2E que protege `main` en `superior-hypermarket-api`.

## Propósito

Garantizar que ningún `Pull Request` hacia `main` se integre sin validar los flujos críticos del sistema mediante Playwright. El gate combina validación local del backend con validación de integración externa.

## Checks requeridos en `main`

Todo `PR → main` debe pasar:

* `lint-test-build` — `Backend CI` (`npm run lint`, `format:check`, `test:coverage`, `build`) en `superior-hypermarket-api`.
* `e2e/17-tests` — 17 tests Playwright en `superior-hypermarket-e2e` (ver arquitectura abajo).

Ambos están configurados como `required` en el Ruleset `main-protection` con `strict: true` (requiere branch actualizado) y `1 aprobación`.

## Flujo simplificado

```
API Pull Request (head_sha)
  → trigger-e2e.yml (api)
  → head.sha
  → GitHub App (superior-hypermarket-e2e-dispatch)
  → superior-hypermarket-e2e / e2e.yml (workflow_dispatch)
  → Playwright (17 tests)
  → e2e/17-tests (Commit Status)
  → API Pull Request (required check)
```

1. `trigger-e2e.yml` en `api` se ejecuta en `pull_request` y obtiene `github.event.pull_request.head.sha`.
2. Dispara `workflow_dispatch` en `superior-hypermarket-e2e` con `inputs: consumer_repo, head_sha, head_ref, pr_number`.
3. `e2e.yml` hace `checkout` de `api` en `consumer_repo@head_sha` y valida `git rev-parse HEAD == head_sha`.
4. Ejecuta `MongoDB 7` + `4 webServers` + `17 E2E` y publica `Commit Status` `e2e/17-tests` `pending → success/failure` sobre el `head_sha` original.

## Por qué `head.sha` y no `github.sha`

En `pull_request`, `github.sha` es el merge commit `refs/pull/123/merge` generado por GitHub, no el commit del PR. Para probar el código exacto propuesto se debe usar `github.event.pull_request.head.sha`.

## `e2e/17-tests`

Es un `Commit Status` (no un `check` de `GITHUB_TOKEN`) creado vía `POST /repos/{owner}/{repo}/statuses/{sha}` con `context: e2e/17-tests`. Aparece como `required` en `Branch Protection` y bloquea el merge mientras está `pending` o `failure`. Solo `success` permite el merge.

## Separación API ↔ E2E

* **API** (`consumidor`): protegido por `e2e/17-tests` externo.
* **E2E** (`harness`): **no** requiere `e2e/17-tests` en su propio `main` para evitar dependencia circular `E2E → e2e/17-tests → E2E`. Su protección exige `PR` y `force push` bloqueado, sin `required` externo.

## Implementación técnica completa

La arquitectura detallada, auditoría histórica de 43 KB, troubleshooting (`429`, `Next 404 cold start`, `strict violation`, `webServer timeout`, `head_sha mismatch`) y configuración de `GitHub App` (`E2E_APP_ID`/`E2E_APP_PRIVATE_KEY`, permisos `Contents: Read, Actions: Write, Commit statuses: Read&Write`) están documentadas en `superior-hypermarket-e2e`:

* `docs/ci-cd/e2e-quality-gate.md`
* `docs/audits/2026-08-21-playwright-e2e-quality-gate.md`

## Quality Gate como infraestructura

Este gate es infraestructura de `CI/CD`. No debe modificarse salvo necesidad concreta. Cualquier cambio en `trigger-e2e.yml`, `e2e.yml`, `Ruleset` o `GitHub App` requiere auditoría previa.

## Ejecución local (referencia)

En `superior-hypermarket-e2e`:

```bash
npm run e2e              # 17 tests
npx playwright test --list  # 17 tests
```

No es necesario para validar este documento.
