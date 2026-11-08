/**
 * Respaldo de "SVG a AppSheet" en Google Sheets.
 * 1) Crea una hoja de cálculo y abre Extensiones > Apps Script.
 * 2) Pega este código. En Configuración del proyecto > Propiedades del script agrega TOKEN con una clave larga.
 * 3) Implementar > Nueva implementación > Aplicación web. Ejecutar como: yo. Acceso: cualquier persona.
 * 4) Copia la URL terminada en /exec y el token en el botón "Sincronizar con Sheets" de la app.
 * Cada proyecto se guarda en la hoja "Proyectos" en fragmentos de 40,000 caracteres (límite de celda: 50,000).
 */
var HOJA = 'Proyectos', CHUNK = 40000;

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(HOJA) || ss.insertSheet(HOJA);
  if (sh.getLastRow() === 0) sh.appendRow(['id', 'seq', 'json']);
  return sh;
}
function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function auth_(t) {
  var k = PropertiesService.getScriptProperties().getProperty('TOKEN');
  return !!k && t === k;
}
function doGet() { return out_({ ok: true, info: 'SVG a AppSheet: use POST.' }); }

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var req = JSON.parse(e.postData.contents);
    if (!auth_(req.token)) return out_({ ok: false, error: 'Token incorrecto' });
    var sh = sheet_();
    if (req.action === 'load') {
      var rows = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues() : [];
      var parts = {};
      rows.forEach(function (r) { (parts[r[0]] = parts[r[0]] || []).push([Number(r[1]), String(r[2])]); });
      var projects = {};
      Object.keys(parts).forEach(function (id) {
        parts[id].sort(function (a, b) { return a[0] - b[0]; });
        try { projects[id] = JSON.parse(parts[id].map(function (p) { return p[1]; }).join('')); } catch (err) {}
      });
      return out_({ ok: true, projects: projects });
    }
    if (req.action === 'save') { borrar_(sh, req.id); guardar_(sh, req.id, JSON.stringify(req.project)); return out_({ ok: true }); }
    if (req.action === 'delete') { borrar_(sh, req.id); return out_({ ok: true }); }
    return out_({ ok: false, error: 'Acción desconocida' });
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}
function borrar_(sh, id) {
  var n = sh.getLastRow();
  if (n < 2) return;
  var ids = sh.getRange(2, 1, n - 1, 1).getValues();
  for (var i = ids.length - 1; i >= 0; i--) if (ids[i][0] === id) sh.deleteRow(i + 2);
}
function guardar_(sh, id, json) {
  var filas = [];
  for (var i = 0, s = 0; i < json.length || s === 0; i += CHUNK, s++) filas.push([id, s, json.substr(i, CHUNK)]);
  sh.getRange(sh.getLastRow() + 1, 1, filas.length, 3).setValues(filas);
}
