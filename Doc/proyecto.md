# token-bar
> Última actualización: 2026-10-23

Mod de Claude Code (feature "mods", probado en 2.1.303) que muestra el consumo de tokens, los límites del plan, el modelo en uso y el estado del repo (git, GitHub/GitLab): una banda animada sobre el prompt con Clawd como compañero de desarrollo (vista por defecto), un panel interactivo (`/token-bar`), una línea de texto opcional bajo el prompt, la config exportable (`/token-bar-config`) y un comando de depuración (`/token-bar-debug`). No gasta tokens: no llama a modelos ni agrega contexto.

La guía para usuarios es el [README.md](../README.md) de la raíz; la de colaboradores, [CONTRIBUTING.md](../CONTRIBUTING.md). Esta carpeta es la documentación técnica.

## Cómo usarlo

### Instalado en todas las sesiones (modo normal)

El repo es a la vez el plugin y su marketplace (`.claude-plugin/marketplace.json` con `source: "./"`). Se registra la carpeta como marketplace local y se instala a nivel usuario:

```sh
claude plugin marketplace add ~/workdir/token-bar
claude plugin install token-bar@guille-nat --scope user
```

Queda en `enabledPlugins` de `~/.claude/settings.json` y carga en todos los proyectos. Como el marketplace es una carpeta y el `source` es relativo, Claude lo lee **directo desde `~/workdir/token-bar`** (lo muestra `claude plugin list` en `Read from:`), sin copia: editás, corrés `/reload-plugins` y toma los cambios, sin reinstalar ni subir versión.

Por qué así y no `--plugin-dir` en el shell ni `CLAUDE_CODE_PLUGIN_DIRS`: es el mecanismo oficial de instalación, aparece en `/plugin` como cualquier otro, y el mismo `marketplace.json` sirve para instalarlo desde GitHub en otra máquina (`/plugin install token-bar --marketplace guille-nat/token-bar`). El paso a paso para otras máquinas está en el [README.md](../README.md) de la raíz.

### Desarrollo y chequeos

```sh
claude --plugin-dir ~/workdir/token-bar          # carga solo para esa sesión, con hot-reload (sin instalar)
claude plugin validate ~/workdir/token-bar       # valida marketplace + manifiesto, lista hooks: y calls:
claude plugin test ~/workdir/token-bar           # tests (sin sesión ni red)
```

## Estructura

```
.claude-plugin/plugin.json       manifiesto y userConfig (preset y archivo de config iniciales)
.claude-plugin/marketplace.json  marketplace local/GitHub (una entrada: este mismo repo)
.claude-plugin/types/            tipos que escribe el engine al cargar el mod (ignorado por git)
.github/CODEOWNERS               todo PR necesita la aprobación del dueño
hooks/hooks.json                 apunta al módulo
hooks/register.tsx               hooks: eventos, comandos, banda, panel y lo que vive Clawd
hooks/mascot.ts                  Clawd puro: poses, partículas, reacciones, activityOf/outcomeOf
hooks/format.ts                  formateo puro (barras, %, niveles de color, modelo, horas es-AR, línea de estado)
hooks/config.ts                  ajustes, presets, export/import de la config (puro)
hooks/repo.ts                    parseo puro de git status, remoto, respuestas de GitHub/GitLab y sus textos
tests/*.test.ts                  unitarios por módulo e integración con el kit (register.test.ts)
tsconfig.json                    para el editor / `tsc -p .` una vez que existan los tipos
README.md                        guía de usuario
CONTRIBUTING.md                  guía de colaboradores
```

## Decisiones y por qué
- **Decisión:** el formateo vive en funciones puras en `format.ts`.
  **Por qué:** requisito del usuario; además permite testear horas, barras y niveles sin montar UI.
- **Decisión:** repo público, `main` protegida (PR con aprobación del dueño por CODEOWNERS; el dueño puede pushear directo).
  **Por qué:** pedido del usuario al publicarlo: que solo él acepte cambios.
- **Decisión:** TypeScript, etiquetas en español.
  **Por qué:** requisito del usuario.

## Historial
- 2026-10-23: repo público; README pensado para usuarios y CONTRIBUTING.md.
- 2026-10-19: versión inicial.
- 2026-10-19: modelo, niveles de color con leyenda y datos del repo.
