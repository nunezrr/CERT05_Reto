# Automatizacion (servicio-tienda)

Un servicio de tienda (productos + pedidos) que recorre un pipeline CI/CD completo:
generar datos → levantar el servicio → correr tests → pipeline → analisis de seguridad.

> Idea central: **el pipeline no es una herramienta de DevOps, es una herramienta de CALIDAD.**
> Cada test que pones en el pipeline es una regla de negocio que nadie puede romper
> sin que el equipo lo sepa en minutos.

---

## Requisitos

- **Node.js v20 o superior** (`node --version`)
- Terminal **PowerShell** (Windows)

## Instalacion (una vez)

Desde esta carpeta (`servicio-tienda`):

```powershell
npm install
```

Instala `@faker-js/faker` (generar datos) y `json-server` (levantar la API).

---

## Estructura del proyecto (pasos enumerados)

Las carpetas estan numeradas en el ORDEN en que se usan durante la sesion:

```
servicio-tienda/
├── package.json            # scripts npm (ver abajo)
├── README.md               # este archivo
├── .gitignore              # ignora datos y reportes generados
│
├── generar-datos/        # PASO 1: generar el dataset con Faker
│   └── generar-datos.js        # crea 2-servicio/db.seed.json (seed reproducible)
│   └── db.json                 # copia de trabajo que lee la API (se genera en el paso 2)
│
├── e2e/                  # PASO 3: las pruebas
│   ├── test-productos.js       # Suite 1: contrato + reglas de negocio + filtros
│   ├── test-pedidos.js         # Suite 2: contrato + ciclo CRUD
│   ├── test-contrato.js        # Suite 3: SLA <800ms, paginacion, busqueda, orden
│   └── runner.js               # orquesta las 3 suites, genera el reporte
│
├── pipeline/             # PASO 4: el pipeline CI/CD
│   ├── buildspec.yml           # guion de AWS CodeBuild (5 fases, incl. security gate)
│   ├── runner-local.js         # ejecuta las 5 fases en Node (comando oficial)
│   ├── runner-local.ps1        # alternativa PowerShell (opcional)
│   ├── restaurar-seed.js       # copia db.seed.json -> db.json
│   └── test-report.json        # reporte de resultados (se genera)
│
└── inspector/            # PASO 5: seguridad
    ├── reporte-inspector.json  # reporte de vulnerabilidades (simulado, CVEs reales)
    ├── analizar-reporte.js     # dashboard + score de riesgo + security gate
    └── resumen-analisis.json   # resumen accionable (se genera)
```

## Scripts npm disponibles

| Comando               | Paso | Que hace                                                     |
|-----------------------|------|--------------------------------------------------------------|
| `npm run generar`     | 1    | Faker genera `datos/db.seed.json` (10 prod + 5 pedidos) |
| `npm run seed`        | 2    | Copia `db.seed.json` → `db.json` (estado limpio)             |
| `npm run api`         | 2    | Levanta json-server en http://localhost:3001                 |
| `npm test`            | 3    | Corre las 3 suites, genera `pipeline/test-report.json`     |
| `npm run test:productos` / `test:pedidos` / `test:contrato` | 3 | Una suite individual |
| `npm run pipeline`    | 4-5  | Ejecuta las 5 fases (BUILD + SECURITY_GATE informativo)      |
| `$env:SECURITY_GATE="on"; npm run pipeline` | 5 | Igual, pero el gate bloquea si el score es alto |
| `npm run inspector`   | 5    | Analiza el reporte de seguridad, calcula el score de riesgo  |

---

## PASO 1 - Generar los datos con Faker

```powershell
npm run generar
```

En vez de escribir el dataset a mano, lo generamos por codigo con Faker. 
Con `faker.seed(12345)` el resultado es **reproducible**: los mismos
datos en cada corrida, por eso los tests son deterministas. Deja un producto inactivo
con stock 0 a proposito (caso de borde). Escribe `datos/db.seed.json` en el
formato que espera json-server: `{ "productos": [...], "pedidos": [...] }`.

## PASO 2 - Levantar el servicio

```powershell
npm run seed     # copia db.seed.json -> db.json (estado conocido)
npm run api      # levanta la API en http://localhost:3001
```

Prueba en el navegador: `http://localhost:3001/productos` y `http://localhost:3001/pedidos`.

## PASO 3 - Correr las pruebas

Con la API corriendo (en otra terminal):

```powershell
npm test
```

Corre 5 suites: productos, pedidos y contrato/rendimiento.
Genera `pipeline/test-report.json` y sale con codigo 0 (OK) o 1 (fallo). Ese codigo
de salida es lo que el pipeline lee para saber si el build paso.

## PASO 4 - Construir y correr la tienda en docker.

```bash
docker build -f app-tienda/Dockerfile -t app-tienda .
docker run -d --name tienda -p 3000:3000 app-tienda
```
## PASO 5 - Contract Testing.

Ejecuta estos comandos desde la raiz del repositorio, en Git Bash (MINGW64).
`MSYS_NO_PATHCONV=1` evita que Git Bash convierta las rutas Linux del contenedor;
`pwd -W` proporciona la ruta Windows que Docker Desktop necesita para el volumen.

5.1 Crear la red y generar el contrato del consumer en `./pacts/`
```bash
mkdir -p pacts
docker network create pact-net
docker build -t consumer-notificaciones ./consumer-notificaciones
MSYS_NO_PATHCONV=1 docker run --rm --mount "type=bind,source=$(pwd -W)/pacts,target=/pacts" -e PACT_DIR=/pacts consumer-notificaciones
```

5.2 Construir y levantar el provider Pact real en la red
```bash
docker build -f provider-tienda/Dockerfile -t provider-tienda .
docker run -d --name provider-tienda --network pact-net provider-tienda
```

5.3 Construir y correr el verificador contra el provider real
```bash
docker build -t provider-verify ./provider-verify
MSYS_NO_PATHCONV=1 docker run --rm --network pact-net --mount "type=bind,source=$(pwd -W)/pacts,target=/pacts" -e PROVIDER_URL=http://provider-tienda:3000 -e PACT_FILE=/pacts/notificaciones-tienda-api.json provider-verify
```

5.4 Limpieza
```bash
docker rm -f provider-tienda
docker network rm pact-net
```