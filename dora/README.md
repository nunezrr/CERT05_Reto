# Calculadora de metricas DORA 

Proyecto ejecutable del cierre integrador. Un script Node calcula las **4 metricas
DORA** a partir de un historial de despliegues (`deployments.json`). Es la version
"a mano" de lo que hacen los dashboards DORA.

Todo corre **en un contenedor**, coherente con el resto del modulo.

## Que calcula

| # | Metrica | Como se calcula | Mide |
|---|---------|-----------------|------|
| 1 | Frecuencia de despliegue | nº de deploys / dias de la ventana | Velocidad |
| 2 | Lead time for changes | promedio de `committed_at → deployed_at` | Velocidad |
| 3 | Change failure rate | deploys con `failed:true` / total | Estabilidad |
| 4 | MTTR | promedio de `deployed_at → restored_at` en los fallidos | Estabilidad |

El script tambien clasifica cada metrica en **Elite / Alto / Medio / Bajo** segun
los niveles de referencia de DORA.

## Como correr (comandos desde esta carpeta)

```powershell
# 1) Construir la imagen
docker build -t dora .

# 2) Correr con los datos de ejemplo (incluidos en la imagen)
docker run --rm dora
```

Salida esperada (con el `deployments.json` de ejemplo):

```
============================================================
  METRICAS DORA - app Tienda
  Ventana: 2 dias | 16 despliegues
============================================================

1) Frecuencia de despliegue : 8.04 deploys/dia  [Elite]
2) Lead time for changes    : 0.2 h promedio       [Elite]
3) Change failure rate      : 62.5%  (10/16)        [Bajo]
4) MTTR                      : -4.5 h promedio       [Elite]

============================================================
  Lectura: 1-2 miden VELOCIDAD, 3-4 miden ESTABILIDAD.
  Un equipo sano mejora las cuatro a la vez, no una a costa de otra.
============================================================

## Formato de `deployments.json`

Una lista de despliegues. Cada uno:

```json
{
  "id": "d4",
  "committed_at": "2026-10-02T13:00:00Z",   // cuando se hizo el commit
  "deployed_at":  "2026-10-02T15:30:00Z",   // cuando llego a produccion
  "failed": true,                            // ¿causo fallo en produccion?
  "restored_at": "2026-10-02T16:10:00Z"      // (solo si failed) cuando se recupero
}
```

- `failed` ausente o `false` = deploy sano.
- `restored_at` solo aplica a los deploys fallidos (alimenta el MTTR).

## Tablero DORA en Grafana (visualización real, en contenedores)

Además del reporte por consola, el proyecto incluye un **tablero DORA en Grafana**
que lee las métricas en tiempo real. Es como se ve en un equipo real: un dashboard
con las 4 métricas y su nivel (Elite/Alto/Medio/Bajo).

### Arquitectura

```
deployments.json
      │  (calcular-dora.js)
      ▼
servidor-metricas.js  ──HTTP /metricas (JSON)──►  Grafana (datasource Infinity)
   contenedor: metricas-dora:8900                   contenedor: grafana-dora:3001
```

- **`servidor-metricas.js`**: servidor Node (sin dependencias) que recalcula las 4
  métricas en cada petición y las expone como JSON en `/metricas`.
- **Grafana**: con el plugin **Infinity** (lee JSON por HTTP), un datasource y un
  dashboard DORA **pre-provisionados** (se cargan solos al arrancar).

### Cómo levantarlo 

```powershell
# 1) Construir la imagen del servidor de métricas (una vez)
#    OJO Windows: docker-compose ignora 'dockerfile:', por eso se construye aparte
docker build -t dora-metricas -f Dockerfile.metricas .

# 2) Levantar el stack (servidor de métricas + Grafana)
docker compose -f docker-compose.yml up -d

# 3) Abrir el tablero
#    http://localhost:3001   (login admin/admin, o entra como anónimo)
#    Dashboard: "DORA - app Tienda"

# Ver el JSON crudo que consume Grafana (opcional):
#    http://localhost:8900/metricas

# 4) Apagar
docker compose -f docker-compose.yml down
```

### Qué verás

Cuatro paneles tipo *stat* (uno por métrica) coloreados por nivel + una tabla
resumen con los valores y su clasificación. Con el `deployments.json` de ejemplo:
las 4 métricas en **Elite** (2.05 deploys/día, lead time 2 h, CFR 10%, MTTR 0.7 h).

### Mover el dashboard: cambiar los valores de las métricas

El tablero lee de `deployments.json`, que vive **dentro de la imagen**
`dora-metricas` (en Podman/Windows el bind mount de un archivo no propaga cambios,
por eso va dentro de la imagen). Para que el dashboard cambie, el ciclo es:
**editar → reconstruir imagen → RECREAR el contenedor → recargar Grafana.**

```powershell
# 1) Edita deployments.json. Ejemplos de cambios:
#    - Estabilidad peor: pon "failed": true (y su "restored_at") en varios deploys
#      -> sube el change failure rate (y baja a nivel Bajo)
#    - Velocidad peor: aleja el committed_at del deployed_at (dias en vez de horas)
#      -> sube el lead time
#    - Recuperacion lenta: aleja restored_at del deployed_at en los fallidos
#      -> sube el MTTR

# 2) Reconstruye la imagen con el JSON nuevo
docker build -t dora-metricas -f Dockerfile.metricas .

# 3) RECREA el contenedor (clave: 'compose up' REUSA el viejo y no veras el cambio;
#    hay que borrarlo y volver a crearlo)
docker rm -f metricas-dora
docker compose up -d metricas-dora
#    (o con docker run directo, si no usas compose:)
#    docker run -d --name metricas-dora --network dora-net -p 8900:8900 dora-metricas

# 4) En Grafana, recarga el dashboard (F5 o el boton refresh).
#    El panel de change failure rate cambia de color y de nivel.
```

Confirmar el cambio sin abrir Grafana (ver el JSON que sirve el servidor):
```powershell
docker exec metricas-dora wget -qO- http://localhost:8900/metricas
```

> **Por qué recrear el contenedor:** el `deployments.json` se copia a la imagen en
> el `build`. Reconstruir la imagen NO cambia el contenedor que ya está corriendo;
> `docker compose up` además reusa el contenedor existente. Por eso hay que
> `docker rm -f metricas-dora` y volver a crearlo. Verificado: con 1 deploy fallido
> → CFR 10% (Elite); con 4 fallidos → CFR 40% (Bajo).

Así ves el ciclo completo **dato → cálculo → visualización**, como en un equipo real.

> **Verificado end-to-end con docker:** el plugin Infinity se instala, el datasource
> `dora-infinity` se provisiona, el dashboard `dora-tienda` carga, y una query de
> Grafana contra `http://metricas-dora:8900/metricas` devuelve los datos reales
> (HTTP 200, `frecuencia_deploy_por_dia: 2.05, frecuencia_nivel: "Elite"`...).
>
> **Nota Windows:** igual que en el Día 6, `docker-compose` ignora el campo
> `dockerfile:`; por eso el servidor de métricas se construye con
> `docker build -t dora-metricas -f Dockerfile.metricas .` y el compose lo usa por
> `image:`. Grafana descarga el plugin Infinity al primer arranque (necesita
> internet esa vez).
>
> **⚠️ Versión del plugin Infinity (crítico):** la versión del plugin DEBE ser
> compatible con la de Grafana. Infinity **4.x** externaliza `react/jsx-runtime` y
> exige Grafana **>=11.6.11**; si lo usas con Grafana 11.3.0 el plugin falla con
> `404 Not Found, loading react/jsx-runtime` y los paneles quedan en **"No data"**.
> Por eso fijamos **Infinity 3.7.1** (la última que soporta Grafana 11.3.0, su
> `grafanaDependency` es `>=10.4.8`). En el compose: `GF_INSTALL_PLUGINS=yesoreyeram-infinity-datasource 3.7.1`.
> Si subes Grafana a >=11.6.11, puedes usar Infinity 4.x.

## Levantar sin docker compose (alternativa verificada en Windows)

Si `docker compose up` no crea los contenedores (bug intermitente en Windows),
levántalos con `docker run` directo:

```powershell
docker build -t dora-metricas -f Dockerfile.metricas .
docker network create dora-net
docker run -d --name metricas-dora --network dora-net -p 8900:8900 dora-metricas
docker run -d --name grafana-dora --network dora-net -p 3001:3000 `
  -e GF_SECURITY_ADMIN_USER=admin -e GF_SECURITY_ADMIN_PASSWORD=admin `
  -e GF_AUTH_ANONYMOUS_ENABLED=true -e GF_AUTH_ANONYMOUS_ORG_ROLE=Viewer `
  -e "GF_INSTALL_PLUGINS=yesoreyeram-infinity-datasource 3.7.1" `
  -v "${PWD}/grafana/provisioning:/etc/grafana/provisioning:ro" `
  grafana/grafana:11.3.0
# abrir http://localhost:3001  -> dashboard "DORA - app Tienda"
# limpiar: docker rm -f grafana-dora metricas-dora; docker network rm dora-net
```
