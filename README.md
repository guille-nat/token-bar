<div align="center">

```
   ▐▛███▜▌
  ▝▜█████▛▘
    ▘▘ ▝▝
```

# token-bar

**Tus límites, tus tokens, tu repo y un compañero que te hace el aguante, todo sobre el prompt de Claude Code.**

![Claude Code mod](https://img.shields.io/badge/Claude%20Code-mod-D97757?style=flat-square)
![0 tokens](https://img.shields.io/badge/consumo%20de%20tokens-0-9ECE6A?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square)
![Tests](https://img.shields.io/badge/tests-87%20pasando-9ECE6A?style=flat-square)
![GitHub y GitLab](https://img.shields.io/badge/GitHub%20%C2%B7%20GitLab-integrado-BB9AF7?style=flat-square)

[Instalación](#-instalación) · [Qué hace](#-qué-hace) · [Clawd](#-clawd-tu-compañero-de-desarrollo) · [Panel](#-el-panel-token-bar) · [Configuración](#-configuración) · [FAQ](#-preguntas-frecuentes) · [Desarrollo](#-desarrollo)

</div>

---

```
  ▐▛███▛▌▝?  ✻ Opus 5.5                │ Sesión ━━━╸──── 23% ↻ 1:50 p. m.  Semana ━━━━━━╸─ 76%  ctx ━╸──── 12%
 ▝▜█████▛    ╰ ✳ pensando…             │ ↑12,3k ↓4,5k  US$ 0,42  ⎇ main ⇡2 ±3 #12 ✓   panel
   ▘▘ ▝▝
 ~/workdir/mi-proyecto
╭──────────────────────────────────────────────────────────────────────────────────────────────────────────────╮
│ >                                                                                                            │
╰──────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
```

> **En una línea:** token-bar es un *mod* de Claude Code que dibuja, arriba del prompt, cuánto te queda del plan (sesión, semana, contexto), cuántos tokens llevás, en qué modelo, rama, PR y CI estás, y a **Clawd**, un bichito animado que cuenta lo que está haciendo Claude, festeja tus tests y tus push, y se rasca la cabeza cuando piensa.

<details>
<summary><b>English summary</b></summary>

token-bar is a Claude Code mod that draws a live, animated band above the prompt: plan rate limits (session, weekly, Fable), context window, token counters, cost, active model, working folder and repo status (branch, ahead/behind, changes, PR/MR, CI for GitHub and GitLab). It ships Clawd, an animated companion that narrates what Claude is doing, celebrates passing tests and pushes, shakes on errors, watches you type, sleeps when idle and puts on deal-with-it shades. It never calls a model and adds nothing to the context: **it costs zero tokens**. Install with `/plugin install token-bar --marketplace guille-nat/token-bar`. The UI is in Spanish.

</details>

---

## ✨ Qué hace

| | |
| --- | --- |
| **Límites del plan en vivo** | Sesión de 5 h, semana y Fable con barras finas `━━╸──`, porcentaje y hora de reinicio (`↻ 1:50 p. m.`). Se llenan con animación al abrir y se deslizan cuando cambian. |
| **Colores que avisan** | Verde < 50 %, amarillo < 75 %, naranja < 90 %, rojo desde 90 %. En rojo el porcentaje late y Clawd te avisa cuál está al límite. Los cortes se pueden cambiar. |
| **Contexto** | `ctx` muestra cuánto de la ventana de contexto ocupa la conversación. |
| **Tokens y costo** | `↑` entrada, `↓` salida de la sesión, separando el hilo principal de los subagentes, y el gasto estimado en US$. |
| **Modelo** | `✻ Opus 5.5` con el destello de Claude que gira y un brillo que recorre el nombre mientras trabaja. |
| **Dónde estás** | La carpeta de trabajo (`~/workdir/mi-proyecto`). |
| **Tu repo de un vistazo** | `⎇ main ⇡2 ±3 #12 ✓`: rama, commits por pushear o traer, cambios sin commitear, el PR o MR de la rama y el estado del CI. Funciona con **GitHub** (`gh`) y **GitLab** (`glab`). |
| **Clawd** | Un compañero animado que reacciona a lo que pasa en la sesión. [Ver todo lo que hace ↓](#-clawd-tu-compañero-de-desarrollo) |
| **Panel completo** | `/token-bar` abre un panel con 6 pestañas: límites, tokens, ajustes, repo, leyenda e info. |
| **Se adapta al ancho** | En terminales angostas se compacta sola: primero suelta la hora de reinicio, después achica barras y, si no entra, pasa los datos debajo de Clawd. |
| **Config portable** | Exportás tu configuración a un JSON y la importás en otra máquina con un comando. |

**Cuesta cero tokens.** token-bar no llama a ningún modelo, no agrega nada al system prompt ni al contexto y no modifica las herramientas: solo lee datos de la sesión y dibuja en tu terminal.

---

## 🚀 Instalación

Necesitás **Claude Code con soporte de mods** (probado desde la 2.1.303).

### Desde el prompt de Claude Code

```
/plugin install token-bar --marketplace guille-nat/token-bar
```

1. Aceptá agregar el marketplace `guille-nat/token-bar`.
2. Elegí el scope **user** para tenerlo en todos tus proyectos (con **project** queda solo en esa carpeta).
3. Elegí un **preset inicial** (`minima`, `normal` o `completa`). Si ya tenés una config exportada, poné su ruta en **Archivo de configuración**.
4. Corré `/reload-plugins` o abrí una sesión nueva. La banda aparece arriba del prompt.

### Desde la terminal

```sh
claude plugin marketplace add guille-nat/token-bar
claude plugin install token-bar@guille-nat --scope user
```

### Actualizar

```sh
claude plugin update token-bar@guille-nat
```

Después, `/reload-plugins` en las sesiones abiertas.

### Desinstalar

```sh
claude plugin uninstall token-bar@guille-nat
claude plugin marketplace remove guille-nat
```

### Opcional: datos de GitHub o GitLab

La rama, los cambios y los commits por pushear salen de `git` y andan siempre. Para ver **PR/MR, CI, issues y reviews pendientes** hace falta la CLI de tu forge con sesión iniciada:

```sh
gh auth login      # GitHub
glab auth login    # GitLab
```

No hay tokens que configurar: token-bar usa la sesión que ya tienen `gh` y `glab`.

---

## 👾 Clawd, tu compañero de desarrollo

Clawd vive a la izquierda de la banda. No es decorado: **sabe lo que está pasando** y reacciona.

### Mientras Claude trabaja, Clawd te cuenta qué hace

```
  ▐▛███▛▌▝?            ▐▛███▜▌                ▐▜███▜▌ ✶
 ▝▜█████▛     ·       ▗▜█████▛▘✻             ▝▜█████▛▘
   ▘▘ ▝▝               ▘▘ ▝▝                  ▘▘ ▝▝
 ╰ pensando…          ╰ ✻ editando app.ts     ╰ ✶ leyendo README.md
```

| Cuando Claude… | Clawd… |
| --- | --- |
| piensa | **se rasca la cabeza como el meme**, mira de reojo y le titila un `?` ("pensando…", "mmm…", "a ver, a ver…") |
| lee un archivo | mueve los ojos de lado a lado: "leyendo register.tsx" |
| busca en el código | "buscando «useState»" |
| edita o escribe | teclea con los dos brazos: "editando mascot.ts" |
| corre un comando | "corriendo npm" |
| usa git | "git rebase…" |
| navega la web | "mirando docs.github.com" |
| lanza un subagente | saluda al ayudante: "ayudante: revisar tests" |
| lleva más de 90 s | transpira `°` y cada tanto lo comenta ("esto viene largo…") |

Todo el tiempo el destello de Claude `✻` orbita a su alrededor.

### Cuando algo sale bien, o mal

```
  ▝▐▀███▀▌▘ ✦          ▄▀▀▀▀▀▀▀▄✧           ▐ ███ ▌
   ▜█████▛ ·          ⇡▝▀▀▀█▀▀▀▘⇡          ▝▜█████▛▘
   ▘▘ ▝▝  ✧              ▘▘ ▝▝                 ▘▘ ▝▝
 ╰ ✓ ¡tests en verde!  ╰ ⇡ ¡pusheado!       ╰ ✗ uy…
```

| Evento | Reacción |
| --- | --- |
| Pasan los tests | brazos arriba, saltos y **confeti de colores**: "¡tests en verde!" |
| Fallan los tests | triste, sudando: "tests en rojo…" |
| `git commit` | "¡commit hecho!" |
| `git push` | **se pone los lentes de *deal with it*** y suben flechas ⇡: "¡pusheado!" |
| Termina la respuesta | festeja con confeti: "¡listo!", "¡hecho!" |
| Termina un turno de más de 1 minuto | se calza los lentes: "todo bajo control" |
| Una herramienta da error | se sacude con los ojos bien abiertos: "uy…", "mmm, falló" |
| Lo frenás con Esc | "ok, freno" |

### Con vos

| Vos… | Clawd… |
| --- | --- |
| abrís una sesión | te saluda según la hora: "¡Hola! ¡buen día!", "¿noche de código?" |
| escribís en el prompt | **te sigue con los ojos** mientras tipeás: "te leo…" |
| mandás el prompt | se agacha y salta: "¡a darle!" |
| le hacés **clic** | se pone contento y le salen corazones ♥: "¡jeje!" |
| le hacés **tres clics seguidos** | **se pone los lentes de *deal with it*** |
| lo dejás solo 3 minutos | se duerme con zzz que suben, y se despierta con lo próximo que pase: "¡eh! ¡volviste!" |

En reposo parpadea, mira a los costados, salta, baila con ♪ ♫, se estira y cada tanto se pone los lentes. Si un límite pasa el 90 %, le titila un `!` rojo y te dice cuál: **"¡ojo! Semana al 93%"**.

> Clawd se apaga con `m` en la pestaña **Info**, sus comentarios con `s` y todas las animaciones con `n`. Sin animaciones queda quieto, pero igual te avisa de los límites.

---

## 🎛️ El panel `/token-bar`

```
/token-bar
```

También se abre con `t` cuando la banda tiene el foco (un clic sobre ella o `ctrl+x tab`). `Esc` lo cierra.

| Tecla | Pestaña | Qué muestra |
| :---: | --- | --- |
| `1` | **Límites** | Modelo y cada límite del plan con barra, porcentaje, hora de reinicio y contexto. |
| `2` | **Tokens** | Entrada, salida y caché de la sesión, el último turno y lo que gastaron los subagentes. |
| `3` | **Ajustes** | Banda, línea de texto, densidad, puntos de color, repo y reinicio de contadores. |
| `4` | **Repo** | Rama, sync, cambios, último commit, PR/MR con review, CI, issues y PRs abiertos, asignados a vos y con review pedida. |
| `5` | **Leyenda** | Qué significa cada color y cada símbolo. |
| `6` | **Info** | Qué se muestra, presets, cortes de color, Clawd y export/import de la config. |

`u` refresca todo al instante, desde cualquier pestaña.

### Los símbolos

| Símbolo | Significado |
| --- | --- |
| `━━━╸────` | Barra de uso (media celda de precisión) |
| `↻ 1:50 p. m.` | Cuándo se reinicia el límite |
| `↑12,3k ↓4,5k` | Tokens de entrada y salida de la sesión |
| `⎇ main` | Rama actual |
| `⇡2 ⇣1` | Commits por pushear y por traer |
| `±3` | Archivos con cambios sin commitear |
| `#12` / `!12` | PR (GitHub) o MR (GitLab) de la rama |
| `✓ ✗ ○` | CI en verde, fallando o corriendo |

---

## ⚙️ Configuración

Todo se elige desde la pestaña **Info** del panel (`/token-bar` → `6`) y se guarda solo.

### Presets

| Tecla | Preset | Qué muestra |
| :---: | --- | --- |
| `z` | **mínima** | Modelo, sesión, semana, contexto y rama. Sin Clawd. |
| `x` | **normal** | Lo de siempre, con Clawd. Es el preset por defecto. |
| `c` | **completa** | Todo: costo, barras largas, cada dato del repo. |

### Interruptores

Cada dato se prende y se apaga por separado: **Modelo, Sesión, Semana, Fable, Contexto, Tokens, Costo, Hora de reinicio, Ruta de trabajo, Rama, Sync, Cambios, PR/MR y CI**. Además: **Clawd** (`m`), **Comentarios de Clawd** (`s`) y **Animaciones** (`n`).

Un dato oculto no da alertas: si ocultás Fable, Clawd no te avisa de Fable.

### Cortes de color

Con `l` elegís desde dónde una barra pasa a amarillo, naranja y rojo: `50/75/90` (por defecto), `60/80/95` o `40/65/85`. El rojo es también el umbral donde el porcentaje late y Clawd avisa.

### Llevar tu configuración a otra máquina

```
/token-bar-config export                      # guarda ~/.config/token-bar/config.json y lo copia al portapapeles
/token-bar-config export ~/dotfiles/tb.json   # o donde quieras
/token-bar-config import ~/dotfiles/tb.json   # en la otra máquina
/token-bar-config import {"mascotOn":false}   # o pegando el JSON
/token-bar-config preset completa             # aplica un preset
/token-bar-config reset                       # vuelve a los valores por defecto
```

También podés poner la ruta del JSON en **Archivo de configuración** al instalar el mod: se importa sola la primera vez. Un JSON hecho a mano puede traer solo los campos que quieras cambiar:

```json
{ "show": { "tokens": false, "cost": true }, "mascotOn": true, "levels": [60, 80, 95] }
```

### Línea de texto bajo el prompt

Si preferís la línea clásica de texto, prendela con `b` en **Ajustes**. Viene apagada porque Claude Code no le permite colores.

---

## ❓ Preguntas frecuentes

<details>
<summary><b>¿Gasta tokens o hace más lenta la sesión?</b></summary>

No gasta tokens. token-bar no llama a ningún modelo, no agrega texto al contexto ni al system prompt y deja pasar cada herramienta sin tocarla. Lo único que corre es local: un reloj de 100 ms que redibuja solo cuando algo cambia, `git status` cada 30 s y una consulta a GitHub o GitLab cada 2 minutos o cuando la rama se mueve.
</details>

<details>
<summary><b>¿Qué datos lee y a dónde los manda?</b></summary>

Lee el uso de la sesión que expone Claude Code (límites, contexto, tokens, costo, modelo), la carpeta de trabajo y el estado del repo con `git`, `gh` y `glab`. No manda nada a ningún servidor propio: las únicas llamadas de red son las de `gh` y `glab` a tu propio GitHub o GitLab, con tu sesión.
</details>

<details>
<summary><b>No veo el PR ni el CI</b></summary>

Hace falta `gh` (GitHub) o `glab` (GitLab) instalados y con sesión (`gh auth login`). La pestaña **Repo** del panel te dice exactamente qué falta. Si el commit no está pusheado, el CI aparece como "sin checks".
</details>

<details>
<summary><b>No aparecen los límites de la sesión o la semana</b></summary>

Los límites los informa Claude Code solo en planes con límites (Pro, Max). Sin datos, la banda muestra `--` en vez de inventar un número. `/token-bar-debug` muestra los datos crudos que llegan.
</details>

<details>
<summary><b>Los símbolos se ven raros</b></summary>

token-bar usa solo caracteres de cajas y bloques Unicode (`━ ╸ ▐ ▛ ✻ ⎇`), sin emojis ni Nerd Fonts, así que debería verse bien en cualquier fuente monoespaciada moderna (JetBrains Mono, Fira Code, Cascadia, etc.). Clawd está pensado para terminales con fondo oscuro.
</details>

<details>
<summary><b>Clawd me distrae</b></summary>

`m` en la pestaña **Info** lo apaga, `s` apaga solo sus comentarios y `n` congela todas las animaciones. El preset **mínima** lo saca de una.
</details>

<details>
<summary><b>Algo no anda</b></summary>

1. Corré `/reload-plugins`.
2. Corré `/token-bar-debug`: muestra el uso crudo, el modelo, el repo, el ancho de la terminal y tus ajustes.
3. Abrí un [issue](https://github.com/guille-nat/token-bar/issues) con esa salida.
</details>

---

## 🛠️ Desarrollo

```sh
git clone https://github.com/guille-nat/token-bar.git
cd token-bar

claude --plugin-dir .        # carga el mod solo en esa sesión, con recarga en caliente
claude plugin validate .     # valida manifiesto, marketplace y hooks
claude plugin test .         # corre los tests (sin red ni sesión)
```

Para usarlo instalado desde tu clon, de modo que cada cambio se vea con `/reload-plugins`:

```sh
claude plugin marketplace add "$PWD"
claude plugin install token-bar@guille-nat --scope user
```

### Estructura

```
.claude-plugin/
  plugin.json        manifiesto y opciones de instalación (preset, archivo de config)
  marketplace.json   este mismo repo es su marketplace
hooks/
  register.tsx       eventos, comandos, banda y panel
  mascot.ts          Clawd: poses, partículas, reacciones (puro)
  format.ts          barras, colores, horas, modelo, línea de estado (puro)
  config.ts          ajustes, presets, export/import (puro)
  repo.ts            git, GitHub y GitLab: parseo y textos (puro)
tests/               unitarios por módulo e integración con el kit de Claude Code
Doc/                 documentación técnica y decisiones de diseño
```

La documentación técnica (eventos que usa, dónde vive el estado, por qué cada decisión) está en [`Doc/`](Doc/README.md).

### Contribuir

Los PRs son bienvenidos. Leé [CONTRIBUTING.md](CONTRIBUTING.md): cómo armar el entorno, las convenciones y cómo se revisan los cambios.

---

<div align="center">

Hecho con ✻ por [Guillermo Natali Ulla](https://github.com/guille-nat)

</div>
