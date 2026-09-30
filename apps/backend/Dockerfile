# sandbox-executor — обычная git-зависимость в apps/backend/package.json
# (github:RunForest1/sandbox-executor#<commit>), не workspace-пакет: её тянет
# сам `bun install` из публичного репозитория, отдельно копировать/собирать
# исходники здесь не нужно — репозиторий коммитит уже собранный dist/.
#
# Билдится с корня монорепозитория как контекстом (см. docker-compose.yml).
# Bun используется только как пакетный менеджер/раннер сборки (раздел 3 CLAUDE.md).
# Прод-процесс поднимается на Node — совместимость NestJS с Bun-рантаймом не проверялась.
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json ./
COPY apps/backend/package.json apps/backend/package.json
# Корневой package.json перечисляет apps/* целиком как workspaces — bun install не
# соберётся, если пути одного из воркспейсов нет в контексте, даже если backend его не использует.
COPY apps/frontend/package.json apps/frontend/package.json
RUN bun install

COPY apps/backend apps/backend

RUN cd apps/backend && bunx prisma generate && bunx nest build

FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

# git+ssh нужны самому backend-процессу: он клонирует репозиторий системным git
# (раздел 3 CLAUDE.md), а не внутри контейнера сборки — см. clone-repository.ts.
# openssl нужен движку Prisma — без него он не может определить версию libssl
# (node:*-slim его не содержит) и падает при `prisma migrate deploy`.
RUN apt-get update && apt-get install -y --no-install-recommends git openssh-client ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*

# Docker CLI с плагином compose — только для compose-деплоя (compose-deploy.service.ts):
# compose — отдельная программа, в dockerode её нет. Оба бинарника статические, поэтому
# берутся из официального образа, а не из apt-репозитория Docker. Демон не нужен —
# CLI ходит в сокет хоста, тот же, что и dockerode.
COPY --from=docker:29-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker:29-cli /usr/local/libexec/docker/cli-plugins/docker-compose /usr/local/libexec/docker/cli-plugins/docker-compose
RUN docker compose version

# У bun workspaces прямые зависимости каждого пакета (включая CLI-бинари вроде prisma)
# лежат симлинками в node_modules САМОГО пакета, а не только в корневом (общий стор
# .bun/ — в корне, но резолвится через локальные симлинки каждого воркспейса). Точечно
# копировать нужные node_modules по одному оказалось хрупко — тащим весь /app целиком
# и выкидываем то, что рантайму backend точно не нужно (образ на self-hosted сервере
# для 2-5 человек — не тот случай, где несколько лишних мегабайт имеют значение).
COPY --from=build /app ./
RUN rm -rf apps/frontend

WORKDIR /app/apps/backend
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/main.js"]
