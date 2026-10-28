# ============================================================
# Dockerfile — API de la Tienda
# Ejecutar desde la raiz del repositorio:
#   Docker:  docker build -f app-tienda/Dockerfile -t app-tienda .
#   Podman:  podman build -f app-tienda/Dockerfile -t app-tienda .
# ============================================================
FROM node:20-alpine

WORKDIR /app

# 1) Copiar package.json primero (mejor cache de capas).
#    El contexto de build es la raiz del repositorio.
COPY app-tienda/package*.json ./
RUN npm install --omit=dev --ignore-scripts

# 2) Copiar la aplicacion y el generador de datos.
COPY app-tienda/servidor ./servidor
COPY app-tienda/public ./public
COPY datos/ ./datos/

# 3) El servidor busca la base en /datos/db.json.
# 3) El servidor busca la base en /datos/db.json.
RUN node datos/generar-datos.js \
  && mkdir -p /datos \
  && cp datos/db.json /datos/db.json

ENV PORT=3000
EXPOSE 3000

# Healthcheck: el orquestador marca el contenedor "healthy" si la API responde.
# OJO con Podman: construye con 'podman build --format docker ...' para que el
# HEALTHCHECK no se ignore (en formato OCI, el default de Podman, se descarta).
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "servidor/server.js"]
