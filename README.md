# SVG a AppSheet

Convierte un código SVG en una expresión de AppSheet (`"data:image/svg+xml;utf8,"&encodeurl(concatenate(...))`) con variables dinámicas, sustituciones, paleta HEX y notas por proyecto.

Sitio estático: `index.html`, `styles.css`, `core.js`, `app.js`. No requiere compilación.

## Publicar en GitHub Pages
Settings > Pages > Build and deployment > Source: Deploy from a branch > Branch: `main`, carpeta `/ (root)`.

## Respaldo opcional en Google Sheets
Sigue las instrucciones de `apps-script/Code.gs` y captura la URL y el token en el botón «Sincronizar con Sheets».
Sin esto, los proyectos viven solo en el `localStorage` del navegador.
