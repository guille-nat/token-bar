# Contribuir a token-bar

¡Gracias por querer sumar! Esta guía explica cómo armar el entorno, qué se espera de un cambio y cómo se revisa.

## Cómo se aceptan los cambios

- `main` está protegida: todo cambio entra por **pull request** y lo aprueba el dueño del repo (`.github/CODEOWNERS`).
- Hacé un fork, trabajá en una rama propia y abrí el PR contra `main`.
- Los workflows de PRs que vienen de forks corren recién cuando el dueño los aprueba.
- Si encontrás un problema de seguridad, no abras un issue público: usá **Security → Report a vulnerability** en GitHub.

## Entorno

Necesitás Claude Code con soporte de mods (2.1.303 o más nuevo).

```sh
git clone https://github.com/<tu-usuario>/token-bar.git
cd token-bar
claude --plugin-dir .        # carga el mod en esa sesión, con recarga en caliente
```

Los tipos del engine los escribe Claude Code en `.claude-plugin/types/` la primera vez que carga el mod (están ignorados por git). Con eso ya funciona el chequeo de tipos.

## Antes de abrir el PR

```sh
claude plugin validate .                 # manifiesto, marketplace y hooks
claude plugin test .                     # todos los tests
npx -p typescript tsc -p .               # tipos en modo estricto
```

Los tres tienen que pasar.

## Convenciones

- **TypeScript estricto**, sin `any`.
- **Lógica pura aparte.** Lo que se puede calcular sin el engine (formateo, parseo, poses de Clawd) va en `hooks/format.ts`, `hooks/config.ts`, `hooks/repo.ts` o `hooks/mascot.ts`, con sus tests unitarios. `hooks/register.tsx` solo conecta eventos y dibuja.
- **Textos de la interfaz en español rioplatense**, cortos y claros.
- **Sin emojis ni Nerd Fonts en la interfaz:** solo caracteres de cajas, bloques y símbolos básicos, para que se vea igual en cualquier fuente.
- **Cero tokens.** El mod no llama a modelos, no agrega contexto ni modifica las herramientas. Un cambio que gaste tokens del usuario no se acepta.
- **Barato en la terminal.** El reloj redibuja solo cuando cambia algo visible. Nada de trabajo pesado en cada tick.
- **Tests para lo nuevo.** Un comportamiento nuevo trae su test, en el archivo de su módulo o en `tests/register.test.ts` si es de integración.
- **Documentación.** Si cambiás una funcionalidad, actualizá su página en `Doc/funcionalidades/` (qué hace, cómo funciona, la decisión y por qué, y una línea en el historial) y el README si cambia algo que ve el usuario.
- **Commits** con [Conventional Commits](https://www.conventionalcommits.org/): `feat(clawd): …`, `fix(band): …`, `docs: …`.

## Dónde está cada cosa

| Quiero cambiar… | Archivo |
| --- | --- |
| Una pose, partícula o reacción de Clawd | `hooks/mascot.ts` (y `activityOf`/`outcomeOf` para qué dispara qué) |
| Qué eventos escucha Clawd | `hooks/register.tsx`: `turn.start`, `tool.call`, `prompt.edit`, `prompt.submit`, `turn.complete` |
| Barras, colores, horas o el nombre del modelo | `hooks/format.ts` |
| Ajustes, presets o el formato de la config | `hooks/config.ts` |
| Datos de git, GitHub o GitLab | `hooks/repo.ts` |
| La banda o el panel | `hooks/register.tsx` (`ui.render` de `AbovePrompt` y de `Pane`) |

La arquitectura y las decisiones de diseño están en [`Doc/`](Doc/README.md).
