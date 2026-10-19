# Datos del repo (git, GitHub, GitLab)
> Última actualización: 2026-10-19

## Qué hace
Muestra el estado del repo de la sesión: rama, commits adelante/atrás del upstream, cambios sin commitear, último commit, el PR (GitHub) o MR (GitLab) de la rama con su review, el CI del último commit y los contadores de issues/PRs abiertos, asignados a vos y con review pedida. Va resumido al final de la barra (`main ⇡2 ±3 #12 ✓`), en la banda y completo en la pestaña **4 Repo** del panel.

## Cómo funciona
- `hooks/repo.ts`: todo puro (parseo de remoto, de `git status --porcelain=v2 --branch`, de las respuestas de GitHub/GitLab, y los textos). Tests en `tests/repo.test.ts`.
- `hooks/register.tsx`: `readRepo` / `refreshRepo` corren los comandos con `$.process.run`.
  1. `$.session.repo()` da la raíz y el remoto `origin`; `null` → no es un repo.
  2. `git --no-optional-locks status --porcelain=v2 --branch` y `git log -1 --format=%s`.
  3. GitHub: **una sola** llamada `gh api graphql --hostname <host>` con `GITHUB_QUERY` (issues, PRs, `statusCheckRollup` del commit HEAD, PRs de la rama, dos `search` con `@me`).
  4. GitLab: `glab api --hostname <host>` contra la REST v4 (`gitlabPaths`): usuario, MRs de la rama, pipeline del sha, `issues_statistics` (todos y `assigned_to_me`), MRs abiertos y con review pedida.
- Cuándo se lee: git en `session.start` (sin esperarlo), cada 30 s, tras cada turno del hilo principal y con `u`. GitHub/GitLab solo si cambió `gitKey` (rama, commit, adelante/atrás), si pasaron 2 min (`FORGE_MS`) o con `u`.
- `refreshRepo` deja una sola lectura en curso; `force` espera la que corre y lee de nuevo.

## Decisiones y por qué
- **Decisión:** habilitar `$.process` (git, gh, glab) además de session/ui/store/clock/command.
  **Por qué:** pedido del usuario (2026-10-19) al sumar el repo; git local no tiene otra vía.
  **Alternativas descartadas:** `$.http` contra las APIs con un token propio: más configuración y otro secreto que guardar; `gh`/`glab` ya tienen la sesión del usuario.
- **Decisión:** GitHub con una única consulta GraphQL.
  **Por qué:** un proceso y ~1 punto del rate limit (5.000/h) por consulta; verificado en vivo (3 puntos usados tras 4 consultas). Con REST serían 5–6 llamadas.
- **Decisión:** el CI es el del commit HEAD (`object(oid:)`), no el del PR.
  **Por qué:** sirve también sin PR. Si el commit no está pusheado, `object` es `null` y se muestra "sin checks".
- **Decisión:** `gh pr view` descartado para el PR de la rama.
  **Por qué:** con `-R` exige argumento y con varios remotos puede pedir un "default repo"; `pullRequests(headRefName:)` no depende de eso.
- **Decisión:** consultar al remoto cada 2 min o cuando la rama se mueve; git local siempre.
  **Por qué:** git es instantáneo; la red no hace falta si nada cambió. `ahead/behind` entra en la clave para que un push refresque el CI.
- **Decisión:** `--no-optional-locks` en `git status`.
  **Por qué:** sin eso `git status` puede tomar `index.lock` y chocar con un commit que esté haciendo Claude.
- **Decisión:** errores por código de salida, no por el texto.
  **Por qué:** git sale en el idioma del sistema (acá en español). `gh` sale con 4 cuando falta `gh auth login`.
- **Decisión:** `⇡⇣` para adelante/atrás.
  **Por qué:** `↑↓` ya son tokens de entrada/salida en la misma línea.
- **Decisión:** GitLab cuenta MRs listando hasta 100 (`100+`).
  **Por qué:** la REST no da el total sin leer headers, y `glab api` no los devuelve por defecto.

## Cómo modificarlo
- Agregar un campo de GitHub: sumarlo a `GITHUB_QUERY` y a `parseGithub`; probar la consulta con `gh api graphql -f query=...` antes.
- **GitLab no se probó en vivo** (glab no estaba instalado el 2026-10-19): las rutas y campos salen de la doc de la API v4. Si algo no aparece, mirar `/token-bar-debug` (campo `repo`) y `forgeError`.
- Ajustes: `g` apaga todo el repo (no corre ningún comando). Tests: `tests/register.test.ts` stubbea `session.repo` y `process.run` (`githubRepo`, caso GitLab, gh no instalado o sin sesión, throttle de 2 min).

## Historial
- 2026-10-19: versión inicial.
