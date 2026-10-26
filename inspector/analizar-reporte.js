/**
 * EJERCICIO - Analizar un reporte de AWS Inspector.
 *
 * Lee 5-inspector/reporte-inspector.json (reporte simulado realista)
 * y produce:
 *   1) Dashboard de severidades
 *   2) Lista priorizada de hallazgos (criticos primero)
 *   3) Plan de accion con los 5 items mas urgentes
 *   4) Deteccion de patrones (librerias deprecated, ReDoS, etc.)
 *   5) Score de riesgo del proyecto
 *
 * En la vida real este script correria en la fase post_build del
 * pipeline: si el score supera un umbral, el deploy se bloquea.
 *
 * Ejecutar desde la carpeta servicio-tienda:
 *   node 5-inspector/analizar-reporte.js
 *   npm run inspector
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rutaReporte = path.join(__dirname, 'reporte-inspector.json');

if (!fs.existsSync(rutaReporte)) {
  console.error('No existe 5-inspector/reporte-inspector.json');
  process.exit(1);
}

const reporte = JSON.parse(fs.readFileSync(rutaReporte, 'utf-8'));
const { hallazgos, resumen, reportMeta } = reporte;

// ── Helpers ──────────────────────────────────────────────────
const colores = {
  reset: '\x1b[0m',
  rojo:  '\x1b[31m',
  naranja: '\x1b[33m',
  amarillo: '\x1b[93m',
  verde: '\x1b[32m',
  cyan:  '\x1b[36m',
  gris:  '\x1b[90m',
  bold:  '\x1b[1m'
};
const c = (color, txt) => colores[color] + txt + colores.reset;

const severidadOrden = { CRITICO: 0, ALTO: 1, MEDIO: 2, BAJO: 3 };
const severidadColor = {
  CRITICO: 'rojo',
  ALTO:    'naranja',
  MEDIO:   'amarillo',
  BAJO:    'verde'
};

function barra(n, total, ancho = 20) {
  const llenos = Math.round((n / total) * ancho);
  return '█'.repeat(llenos) + '░'.repeat(ancho - llenos);
}

// ── 1) ENCABEZADO ────────────────────────────────────────────
console.log(c('bold', '\n╔══════════════════════════════════════════════════════╗'));
console.log(c('bold',   '║       ANALISIS DE REPORTE - AWS Inspector v2         ║'));
console.log(c('bold',   '╚══════════════════════════════════════════════════════╝'));
console.log(c('gris', '  Generado : ' + reportMeta.generatedAt));
console.log(c('gris', '  Region   : ' + reportMeta.region));
console.log(c('gris', '  Cuenta   : ' + reportMeta.cuenta));

// ── 2) DASHBOARD DE SEVERIDADES ──────────────────────────────
console.log(c('cyan', '\n── DASHBOARD DE SEVERIDADES ──────────────────────────'));
const total = resumen.total;
[
  { key: 'critico',     label: 'CRITICO',     n: resumen.critico },
  { key: 'alto',        label: 'ALTO   ',     n: resumen.alto },
  { key: 'medio',       label: 'MEDIO  ',     n: resumen.medio },
  { key: 'bajo',        label: 'BAJO   ',     n: resumen.bajo }
].forEach(({ key, label, n }) => {
  const color = severidadColor[key.toUpperCase()] || 'gris';
  const pct = ((n / total) * 100).toFixed(0);
  console.log(
    '  ' + c(color, label) +
    '  ' + c(color, barra(n, total, 25)) +
    '  ' + String(n).padStart(2) + '  (' + pct + '%)'
  );
});
console.log('  ' + '─'.repeat(52));
console.log('  TOTAL'.padEnd(11) + '  ' + '░'.repeat(25) + '  ' + total);

// ── 3) HALLAZGOS PRIORIZADOS ─────────────────────────────────
console.log(c('cyan', '\n── HALLAZGOS PRIORIZADOS (mayor riesgo primero) ──────'));
const ordenados = [...hallazgos].sort((a, b) => {
  const diff = severidadOrden[a.severidad] - severidadOrden[b.severidad];
  return diff !== 0 ? diff : b.puntajeCVSS - a.puntajeCVSS;
});

ordenados.forEach((h, i) => {
  const color = severidadColor[h.severidad] || 'gris';
  const num = String(i + 1).padStart(2);
  console.log(
    '\n  ' + num + ') ' + c(color, '[' + h.severidad + ' ' + h.puntajeCVSS + ']') +
    '  ' + c('bold', h.titulo)
  );
  console.log(c('gris', '      Paquete  : ' + h.paquete + ' ' + h.versionAfectada + ' -> ' + h.versionCorregida));
  console.log(c('gris', '      Recurso  : ' + h.recurso.split(':').pop()));
  console.log(c('gris', '      Accion   : ' + h.recomendacion.slice(0, 90) + (h.recomendacion.length > 90 ? '...' : '')));
});

// ── 4) PLAN DE ACCION: TOP 5 URGENTES ────────────────────────
console.log(c('cyan', '\n── PLAN DE ACCION: TOP 5 MAS URGENTES ───────────────'));
ordenados.slice(0, 5).forEach((h, i) => {
  const color = severidadColor[h.severidad] || 'gris';
  console.log(
    '  ' + (i + 1) + '. ' + c(color, h.severidad) +
    ' | ' + h.paquete + ' | ' + h.titulo.slice(0, 50)
  );
  console.log(c('gris', '     → ' + h.recomendacion.split('.')[0] + '.'));
});

// ── 5) DETECCION DE PATRONES ─────────────────────────────────
console.log(c('cyan', '\n── PATRONES DETECTADOS ───────────────────────────────'));

const redos = hallazgos.filter(h => h.descripcion.toLowerCase().includes('redos') ||
                                     h.titulo.toLowerCase().includes('redos'));
if (redos.length > 0) {
  console.log(c('naranja', '  ⚠  ReDoS (' + redos.length + ' hallazgo/s): ' +
    redos.map(h => h.paquete).join(', ')));
  console.log(c('gris', '     Las expresiones regulares vulnerables son un vector comun en dependencias JS.'));
}

const deprecated = hallazgos.filter(h => h.descripcion.toLowerCase().includes('deprecated') ||
                                          h.descripcion.toLowerCase().includes('abandonado'));
if (deprecated.length > 0) {
  console.log(c('naranja', '  ⚠  Paquetes deprecated (' + deprecated.length + '): ' +
    deprecated.map(h => h.paquete).join(', ')));
  console.log(c('gris', '     Migrar a alternativas mantenidas activamente.'));
}

const infraSec = hallazgos.filter(h => h.id.startsWith('INSPECTOR-SEC'));
if (infraSec.length > 0) {
  console.log(c('rojo', '  ✗  Configuracion insegura de infraestructura (' + infraSec.length + '): ' +
    infraSec.map(h => h.titulo).join('; ')));
}

const sinParche = hallazgos.filter(h => h.versionCorregida === 'sin-parche-disponible');
if (sinParche.length > 0) {
  console.log(c('rojo', '  ✗  Sin parche disponible (' + sinParche.length + '): ' +
    sinParche.map(h => h.paquete).join(', ') + ' -> migrar.'));
}

// ── 6) SCORE DE RIESGO ────────────────────────────────────────
// Formula simple: critico*10 + alto*5 + medio*2 + bajo*1
const score = resumen.critico * 10 + resumen.alto * 5 + resumen.medio * 2 + resumen.bajo * 1;
const UMBRAL_BLOQUEO = 25;
const UMBRAL_ALERTA  = 10;

let nivelRiesgo, colorRiesgo;
if (score >= UMBRAL_BLOQUEO) { nivelRiesgo = 'ALTO - DEPLOY BLOQUEADO';  colorRiesgo = 'rojo'; }
else if (score >= UMBRAL_ALERTA) { nivelRiesgo = 'MEDIO - ALERTA';       colorRiesgo = 'naranja'; }
else { nivelRiesgo = 'BAJO - OK';                                          colorRiesgo = 'verde'; }

console.log(c('cyan', '\n── SCORE DE RIESGO ───────────────────────────────────'));
console.log('  Formula: (critico x10) + (alto x5) + (medio x2) + (bajo x1)');
console.log('  Score   : ' + c(colorRiesgo, c('bold', String(score))) +
  '  (umbral bloqueo=' + UMBRAL_BLOQUEO + ', alerta=' + UMBRAL_ALERTA + ')');
console.log('  Nivel   : ' + c(colorRiesgo, c('bold', nivelRiesgo)));

if (score >= UMBRAL_BLOQUEO) {
  console.log(c('rojo', '\n  En el pipeline: este score bloquearia el deploy a produccion.'));
  console.log(c('gris', '  Resuelve los CRITICOS y ALTOS y vuelve a correr el analisis.'));
}

// ── GUARDAR RESUMEN ───────────────────────────────────────────
const resumenSalida = {
  fecha: new Date().toISOString(),
  score,
  nivelRiesgo,
  deployBloqueado: score >= UMBRAL_BLOQUEO,
  resumen,
  top5: ordenados.slice(0, 5).map(h => ({
    id: h.id, severidad: h.severidad, paquete: h.paquete, titulo: h.titulo
  }))
};
const rutaSalida = path.join(__dirname, 'resumen-analisis.json');
fs.writeFileSync(rutaSalida, JSON.stringify(resumenSalida, null, 2));
console.log(c('gris', '\n  Resumen guardado en 5-inspector/resumen-analisis.json'));
console.log(c('bold', '══════════════════════════════════════════════════════\n'));

// Codigo de salida: 1 si el deploy deberia bloquearse
process.exit(score >= UMBRAL_BLOQUEO ? 1 : 0);
