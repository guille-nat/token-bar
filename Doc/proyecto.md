# token-bar
> Última actualización: 2026-10-19

Mod de Claude Code (feature "mods", probado en 2.1.303) que muestra el consumo de tokens, los límites del plan, el modelo en uso y el estado del repo (git, GitHub/GitLab): una línea bajo el prompt, un panel interactivo (`/token-bar`), una banda opcional sobre el prompt y un comando de depuración (`/token-bar-debug`).

## Cómo usarlo

```sh
claude --plugin-dir ~/workdir/token-bar          # carga solo para esa sesión, con hot-reload
claude plugin validate ~/workdir/token-bar       # lista hooks: y calls:
claude plugin test ~/workdir/token-bar           # tests (sin sesión ni red)
```

No se instala: solo `--plugin-dir`.

## Estructura

```
.claude-plugin/plugin.json   manifiesto
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
