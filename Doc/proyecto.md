# token-bar
> Última actualización: 2026-10-19

Mod de Claude Code (feature "mods", probado en 2.1.303) que muestra el consumo de tokens, los límites del plan, el modelo en uso y el estado del repo (git, GitHub/GitLab): una línea bajo el prompt, un panel interactivo (`/token-bar`), una banda opcional sobre el prompt y un comando de depuración (`/token-bar-debug`).

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
.claude-plugin/plugin.json   manifiesto
.claude-plugin/marketplace.json  marketplace local/GitHub (una entrada: este mismo repo)
.claude-plugin/types/        tipos que escribe el engine al cargar el mod (ignorado por git)
hooks/hooks.json             apunta al módulo
hooks/register.tsx           hooks: eventos, comandos, dibujo
hooks/format.ts              formateo puro (barras, %, niveles de color, modelo, horas es-AR, línea de estado)
hooks/repo.ts                parseo puro de git status, remoto, respuestas de GitHub/GitLab y sus textos
tests/format.test.ts         unit tests de format.ts
tests/repo.test.ts           unit tests de repo.ts
tests/register.test.ts       integración con el kit: stubs de session.usage/model/repo y process.run, panel, banda, barra
tsconfig.json                para el editor / `tsc -p .` una vez que existan los tipos
```

## Decisiones y por qué
- **Decisión:** el formateo vive en funciones puras en `format.ts`.
  **Por qué:** requisito del usuario; además permite testear horas, barras y niveles sin montar UI.
- **Decisión:** TypeScript, etiquetas en español.
  **Por qué:** requisito del usuario.

## Historial
- 2026-10-19: versión inicial.
- 2026-10-19: modelo, niveles de color con leyenda y datos del repo.
