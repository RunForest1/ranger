# Универсальный образ для install/test/build шагов сборки (см. раздел 4 CLAUDE.md:
# "три текстовых поля команд" — не Dockerfile на проект, поэтому набор инструментов
# должен покрывать большинство стеков без ручной донастройки внутри команд).
# git/ssh здесь не нужны: клонирование репозитория выполняется на хосте, в контейнер
# монтируется уже готовый checkout (раздел 9 CLAUDE.md — sandbox-executor ничего не
# знает про git/deploy-key, только про команду и рабочую директорию).
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      unzip \
      python3 \
      python3-pip \
      build-essential \
    && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL https://bun.sh/install | bash \
    && mv /root/.bun/bin/bun /usr/local/bin/bun
