/**
 * Restaura db.json al estado original desde db.seed.json.
 * Equivale al "Copy-Item db.seed.json db.json".
 * Lo usa el pipeline (local y CodeBuild) en la fase pre_build
 * para garantizar que cada corrida parte del mismo estado.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const servicio = path.join(__dirname, '..', 'datos');
const seed   = path.join(servicio, 'db.seed.json');
const activo = path.join(servicio, 'db.json');

if (!fs.existsSync(seed)) {
  console.error('No existe datos/db.seed.json. Corre primero:  npm run generar');
  process.exit(1);
}

fs.copyFileSync(seed, activo);
const datos = JSON.parse(fs.readFileSync(activo, 'utf-8'));
console.log('Dataset restaurado: ' +
  datos.productos.length + ' productos, ' +
  datos.pedidos.length + ' pedidos.');
