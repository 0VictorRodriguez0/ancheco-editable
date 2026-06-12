# AnCheco landing — versión editable por el cliente

Landing de AnCheco con un CMS git-native encima. El cliente entra a `/admin`, edita los textos en un panel, y cada guardado es un commit en este repo. GitHub Pages re-despliega solo y los cambios quedan en vivo en ~1 minuto.

**Live:** https://0victorrodriguez0.github.io/ancheco-editable/
**Editor:** https://0victorrodriguez0.github.io/ancheco-editable/admin/
**Repo "fuente de verdad" original:** [henrylopez-del/ancheco-landing](https://github.com/henrylopez-del/ancheco-landing)

---

## Cómo funciona

1. La página carga el HTML normal y al final ejecuta un script chico que hace `fetch('content/content.json')`.
2. Por cada elemento marcado con `data-cms="path.to.field"`, el script reemplaza su texto con el valor del JSON.
3. Si el JSON falla, la página se ve con los textos hardcodeados (fallback silencioso, nada se rompe).
4. El editor (`/admin`) es **[Sveltia CMS](https://github.com/sveltia/sveltia-cms)** — un fork moderno de [Decap CMS](https://github.com/decaporg/decap-cms) que hace login directo con GitHub y commitea los cambios al repo. Cada save = un commit.

---

## Qué se puede editar (alcance del MVP)

| Sección | Editable | Notas |
| --- | --- | --- |
| Hero (título, subtítulo, "Elección consciente") | ✅ | |
| 6 tarjetas de producto (nombre + descripción) | ✅ | |
| 4 chips de "trust strip" | ✅ | |
| ¿Quiénes somos? (4 párrafos + badges + cierre) | ✅ | Soporta `<strong>` |
| Topbar y mensajes de los ribbons | ✅ | |
| Footer (línea principal) | ✅ | |
| Wizards (los 6 cotizadores) | ❌ | Fase 2 — requiere refactor mayor del JS |
| Precios y fórmulas (`PRODUCTOS_PATRIMONIAL`, etc) | ❌ | Fase 2 |

---

## Setup del editor (una sola vez)

Para que `/admin` funcione contra GitHub, hay 2 caminos:

### Opción A — Usar OAuth proxy de Netlify (el más fácil)
1. El cliente entra a `/admin/` y le da clic a "Sign in with GitHub".
2. Sveltia usa el proxy gratuito de api.netlify.com — sin configuración extra.

### Opción B — Registrar una GitHub App propia de AnCheco (pulido, opcional)
1. Crear una GitHub App en https://github.com/settings/apps con `repo` permission.
2. Anotar el `client_id`.
3. Agregar al `admin/config.yml`:
   ```yaml
   backend:
     name: github
     repo: 0VictorRodriguez0/ancheco-editable
     branch: main
     client_id: <el-client-id-de-la-app>
   ```
4. Listo: el login queda con el branding de AnCheco.

### Modo dev (local, sin commitear)
Para probar el editor sin tocar GitHub:
```bash
cd ancheco-editable
npx http-server -p 8080 &
# y por separado:
npx decap-server &
# abre http://localhost:8080/admin/
```
Los "guardados" se quedan en local mientras `local_backend: true` esté activado en `config.yml`.

---

## Cómo añadir un campo nuevo

1. Editar `content/content.json` y agregar la clave nueva con su valor.
2. Marcar en `index.html` el elemento con `data-cms="ruta.a.la.clave"` (o `data-cms-html` si lleva HTML).
3. Agregar el field correspondiente a `admin/config.yml` para que aparezca en el editor.

---

## Estructura del repo

```
ancheco-editable/
├── index.html              ← landing con atributos data-cms y script de hidratación
├── assets/                 ← logos y fotos
├── content/
│   └── content.json        ← textos editables (la fuente de verdad del copy)
├── admin/
│   ├── index.html          ← carga Sveltia CMS desde CDN
│   └── config.yml          ← define los campos del editor
└── README.md
```

---

## Roadmap

- **Fase 2 — wizards editables**: externalizar los textos de los explainers (intro/body/example/rec) del wizard genérico a `content/wizards.json` y modificar `explainerHTML()` para leer de ahí.
- **Fase 3 — precios editables**: mover `PRODUCTOS_PATRIMONIAL`, `PRODUCTOS_AHORRO`, etc. a `content/productos.json` con campos numéricos (rate, fixedBase) para que Andy pueda recalibrar sin tocar código.
- **Fase 4 — historial de cambios**: el cliente puede ver el log de commits desde el editor y revertir si algo salió mal.
