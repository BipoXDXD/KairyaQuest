# O bundle é portátil; o Node roda na arquitetura do builder, e o Nginx na do alvo.
FROM --platform=$BUILDPLATFORM node:24.22.0-alpine@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f AS build
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY frontend/ ./
RUN VITE_API_URL=/api npm run build

FROM nginx:1.30.6-alpine@sha256:c59d1f8b1e0e42da75be973424cd72e23f7f8adfb54e982f4d1cd0216a5a5576
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /web/dist/ /usr/share/nginx/html/
USER 101:101
EXPOSE 8080
ENTRYPOINT ["nginx", "-g", "daemon off;"]
