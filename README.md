# token-bar

Mod de Claude Code que muestra el consumo de tokens, los límites del plan, el modelo en uso y el estado del repo (git, GitHub/GitLab): una banda animada con colores sobre el prompt, un panel interactivo (`/token-bar`), una línea de texto opcional bajo el prompt y un comando de depuración (`/token-bar-debug`).

Requiere Claude Code con soporte de mods (probado en 2.1.303). La documentación completa está en [Doc/](Doc/README.md).

## Instalación

El repo es a la vez el plugin y su marketplace (`.claude-plugin/marketplace.json`), así que se instala con una línea.

### En otra máquina (desde GitHub)

El repo es privado: la máquina necesita acceso a GitHub con tu cuenta (`gh auth login`, o una clave SSH cargada en GitHub). Después:

1. Abrí Claude Code en cualquier carpeta:

   ```sh
   claude
   ```

2. En el prompt, instalá el mod:

   ```
   /plugin install token-bar --marketplace guille-nat/token-bar
   ```

3. Respondé `y` cuando pregunte si agrega el marketplace `guille-nat/token-bar`.
4. Elegí el scope **user** para que cargue en todos los proyectos (con **project** queda solo en esa carpeta).
5. Reiniciá la sesión o corré `/reload-plugins`. Tiene que aparecer la línea de tokens bajo el prompt y responder `/token-bar`.

Lo mismo desde la terminal, sin entrar al prompt:

```sh
claude plugin marketplace add guille-nat/token-bar
claude plugin install token-bar@guille-nat --scope user
```

Para actualizar cuando haya cambios nuevos en GitHub:

```sh
claude plugin update token-bar@guille-nat
```

y luego `/reload-plugins` en las sesiones abiertas.

### En la máquina donde está clonado el repo (desarrollo)

Se registra la carpeta como marketplace local e instala a nivel usuario. Claude lo lee directo desde la carpeta, sin copia: editás, corrés `/reload-plugins` y toma los cambios.

```sh
git clone git@github.com:guille-nat/token-bar.git ~/workdir/token-bar
claude plugin marketplace add ~/workdir/token-bar
claude plugin install token-bar@guille-nat --scope user
```

Verificación:

```sh
claude plugin list        # token-bar@guille-nat · Read from: ~/workdir/token-bar · Scope: user · enabled
```

Si en esa máquina ya estaba el marketplace de GitHub con el mismo nombre, primero quitalo (`claude plugin marketplace remove guille-nat`) y después agregá la carpeta.

### Desinstalar

```sh
claude plugin uninstall token-bar@guille-nat
claude plugin marketplace remove guille-nat
```

## Uso

| Qué | Cómo |
| --- | --- |
| Banda sobre el prompt | Visible por defecto: Clawd animado (saluda, baila, duerme, avisa al límite), modelo con el destello de Claude, límites, contexto y repo con barras animadas. `t` (con la banda enfocada) abre el panel. |
| Panel interactivo | `/token-bar` (pestañas Plan, Repo, Leyenda y Ajustes). |
| Línea de texto bajo el prompt | Opcional, se activa con `b` en Ajustes del panel. |
| Depuración | `/token-bar-debug` muestra los datos crudos que devuelve el engine. |

## Desarrollo

```sh
claude --plugin-dir ~/workdir/token-bar    # carga solo para esa sesión, sin instalar
claude plugin validate .                   # valida marketplace, manifiesto y hooks
claude plugin test .                       # tests unitarios y de integración
```

Estructura de carpetas, eventos usados y decisiones de diseño: [Doc/proyecto.md](Doc/proyecto.md) y [Doc/arquitectura.md](Doc/arquitectura.md).
