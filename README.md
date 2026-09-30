# Ranger

*[Читать по-русски](./README.ru.md)* · License: [Apache 2.0](./LICENSE)

A self-hosted CI/CD hub with metrics for a single server and 2–5 trusted users.
Add a project by its SSH git URL, set three commands — install, test, build — and
press "Build" (or set a cron schedule). In one tab you get the live build log, step
status, deployment to a Docker container, and container and host metrics.

It is a lightweight replacement for Jenkins + Portainer + a slice of Grafana: one
`docker compose up`, no pipeline YAML, no plugins.

## Why I'm building this

I have one home server and a few projects of my own on it. Running three separate
services for them — CI, a container panel and monitoring — is overkill, and deploying
by hand with `ssh` + `git pull` + `docker build` got old. Ranger covers the whole path
from commit to running container in one tool.

Three priorities follow from that:

1. **Setup speed beats flexibility.** An SSH URL, a deploy key and three text fields
   for commands are the entire config.
2. **Logs and metrics are a third of the product, not an add-on.** A build without a
   live log and a deploy without container metrics is an unfinished tool.
3. **Security is checked in every iteration.** Builds run in unprivileged, isolated
   containers, secrets are encrypted, and the terminal is admin-only with a password
   re-prompt.

## Features

- **Projects and builds** — install → test → build in an isolated container with
  limits (512 MB memory, 1 CPU, process cap, 15-minute timeout per step). Builds of one
  project run strictly one at a time. Live log over WebSocket.
- **Deploy** — if the repo root has a `Dockerfile` and the project has ports set:
  image build → stop the old container → start the new one → health check →
  automatic rollback to the previous image on failure. Plus manual rollback to any
  earlier successful build.
- **Docker Compose deploy** — `docker compose up` with a file from the repository:
  multiple services, their own volumes and networks. Only an admin can enable it.
- **Environment variables** — set in project settings, passed to both the build steps
  and the deployed container. Stored encrypted, never shown after saving, masked in
  the build log.
- **Branches** — any branch can be built; only the main branch is deployed.
- **Triggers** — manual or cron.
- **Containers** — every container on the host, its status and live logs.
- **Metrics** — host CPU/RAM/disk and per-container CPU/RAM with a one-hour chart.
- **Files** — read-only view of a project's working directory.
- **Terminal** — a shell in the project's container or working directory, admin-only,
  with a password re-prompt and an audit log entry.
- **Users and roles** — `admin`, `operator`, `viewer`, plus an audit log.
- **Public status page** `/status` — only for projects where it's explicitly enabled:
  name, status and time of the last build.
- **UI** — light and dark themes, RU/EN, command palette on `Ctrl+K`.

## Stack

| Layer | Choice |
|---|---|
| Backend | NestJS, TypeScript, Prisma |
| Database and queue | PostgreSQL, pg-boss (build queue in the same database) |
| Docker | `dockerode` over the host socket |
| Build isolation | [sandbox-executor](https://github.com/RunForest1/sandbox-executor) — a separate package |
| Realtime | WebSocket (socket.io) |
| Frontend | React 18, Vite, Tailwind, Zustand, react-i18next |
| Packages and scripts | Bun (the production backend process runs on Node) |
| Hosting | your own server, `docker compose` |

The isolation module lives in its own repository and knows nothing about Ranger:
"image + command + limits → result". Another project of mine uses it as a judge for
algorithm problems. Ranger pulls it in as a git dependency pinned to a version tag
(`#v0.2.0`).

## Layout

```
apps/
  backend/                 NestJS API
    src/
      projects/            projects, deploy key, environment variables
      builds/              queue, cloning, build steps, live log over WebSocket
      deployments/         deploy, health check, rollback
      containers/          host container list and logs
      metrics/             host and container metrics
      terminal/            container shell over WebSocket
      auth/ users/ audit/  sessions, roles, users, audit log
      status/              public status page
    prisma/                schema and migrations
    docker/                the image build steps run in
  frontend/                React SPA served by nginx, proxies /api and /socket.io
docker-compose.yml         postgres + backend + frontend
CLAUDE.md                  architecture, data model, development rules
```

## Server installation

You need a Linux server with Docker and Docker Compose, internet access (for
`bun install` and images) and permission to use `docker` (root or the `docker` group).

### 1. Code and config

```bash
git clone https://github.com/RunForest1/ranger.git
cd ranger
cp .env.example .env
```

Fill in `.env`:

| Variable | Meaning |
|---|---|
| `SESSION_SECRET` | cookie session secret: `openssl rand -hex 32` |
| `DEPLOY_KEY_ENCRYPTION_KEY` | encryption key for deploy keys and environment variables: `openssl rand -hex 32`. **Do not change it after the first saved project** — already-stored secrets would stop decrypting. Keep a copy off the server |
| `RANGER_WORKDIR_HOST_PATH` | absolute path **on the host** for build checkouts, e.g. `/srv/ranger/build-workdir` |
| `ADMIN_EMAIL` | email of the first administrator |

```bash
sudo mkdir -p /srv/ranger/build-workdir   # same path as RANGER_WORKDIR_HOST_PATH
```

Why a host path: the backend runs in a container but controls Docker through the
host's socket. When it asks the daemon to mount a checkout into a build container,
the daemon resolves the path on the host, not inside the backend container.

### 2. Start

```bash
docker compose up -d --build
```

What happens on first start:

1. The backend and frontend images are built.
2. PostgreSQL starts; the backend waits until it's available.
3. The backend applies migrations (`prisma migrate deploy`).
4. The backend builds the `ranger-builder:latest` image that build steps run in
   (Node 20, Bun, Python, build-essential). **This takes a few minutes**, and the UI
   returns 502 until it's done. Follow with `docker compose logs -f backend`.
5. On an empty database an administrator is created with `ADMIN_EMAIL`, and their
   password is printed to the log once.

The UI is on port `8080`. The administrator's password:

```bash
docker compose logs backend | grep -A2 "первый администратор"
```

(The log line is in Russian: "первый администратор" = "first administrator".)

You must change the password on first login. The administrator then creates other
users on the "Users" page with the `admin`, `operator` or `viewer` role.

Lost the password:

```bash
docker compose exec backend node dist/cli/reset-password.js admin@example.com
```

The hub serves plain HTTP. That's fine on a LAN or behind a VPN; if you expose it to
the internet, put a reverse proxy with HTTPS in front of it.

### Updating

```bash
git pull
docker compose up -d --build
```

Migrations are applied automatically when the backend starts. Data (database, build
logs, checkouts) lives in volumes and in `RANGER_WORKDIR_HOST_PATH` and survives a
rebuild.

## Connecting your first project

### 1. Deploy key

Ranger clones the repository over SSH with a dedicated read-only key — not your
personal key. Create it on any machine:

```bash
ssh-keygen -t ed25519 -f ranger_deploy -N "" -C "ranger"
```

- `ranger_deploy.pub` goes to the repository on GitHub: **Settings → Deploy keys → Add
  deploy key**, leaving **Allow write access unchecked**.
- `ranger_deploy` (private) goes into the project form in Ranger. You can delete the
  file afterwards: Ranger stores the key encrypted.

### 2. The project in Ranger

**Add project**:

- **Git URL** — an SSH URL: `git@github.com:owner/repo.git`.
- **Deploy key** — the contents of `ranger_deploy`. The "Check repository" button
  fetches the branch list right away — if it comes back, access is set up correctly.
- **Commands** — npm/bun/python presets or your own. At least one is required. They run
  in the repository root inside the `ranger-builder` image with internet access (so
  they can install packages).
- **Environment variables** — if the build or the app needs tokens and addresses. You
  can paste a ready-made `.env`.

### 3. Deploy (optional)

To have Ranger run the project rather than just build it:

1. The repository root must contain a `Dockerfile`. The image is built from the
   checkout **after** the install/test/build steps, so it already contains build
   output (e.g. `dist/`).
2. In project settings expand "Deploy" and set the **container port** (what the app
   listens on inside) and the **host port** (where it will be reachable from outside).

The health check verifies that the container port starts accepting TCP connections
within 30 seconds. If not, Ranger restores the previous working image.

A deployed container is named `ranger-deploy-<project id>`, restarts on its own
(`unless-stopped`) and survives a server reboot.

If the project needs several services (app + database + worker), use
[Docker Compose deploy](#docker-compose-deploy) instead of a single container.

## Security

- The Docker socket is available only to the backend — it is never passed into build
  containers or single-container deploys. Compose deploy is a deliberate exception:
  the compose file decides what to mount, so only an admin can enable that mode (see
  the compose section).
- Build steps: no `--privileged`, all capabilities dropped, `no-new-privileges`,
  memory/CPU/process limits, a forced timeout.
- Deploy keys and environment variables are encrypted at the application level
  (AES-256-GCM) and never appear in API responses. Only an admin can decrypt them,
  and every such request is written to the audit log.
- The terminal is admin-only, requires a password re-prompt, is logged, and has a
  session limit.
- Passwords are stored as `argon2` hashes. There is no sign-up: an admin creates users.

> The Docker socket is root access to the host. Anyone who can change the backend
> code or get command execution inside it controls the server. Ranger is built for
> trusted users (the `operator` role already means "can run arbitrary build commands
> in a container with internet access"), not for public use.

## Local development

```bash
cp .env.example .env
cp apps/backend/.env.example apps/backend/.env
docker compose up -d postgres

bun install                  # also pulls sandbox-executor from GitHub

cd apps/backend
bunx prisma migrate dev      # applies migrations
bun run dev                  # http://localhost:3000, prints the admin password on an empty database

cd ../frontend
bun run dev                  # http://localhost:5173, proxies /api and /socket.io to the backend
```

Checks (CI runs the same in `.github/workflows/ci.yml`):

```bash
bun run lint                 # backend + frontend
bun run build                # backend + frontend
```

You need access to the Docker socket (your user in the `docker` group): the backend
starts build containers. Change the schema with `bunx prisma migrate dev --name <name>`;
commit the resulting migration — production only runs `prisma migrate deploy`.

---

# Documentation

## How a build works

The lifecycle of one build:

1. **Trigger.** The "Build" button, cron or the API creates a `builds` row with status
   `queued` and puts a job on the project's queue. The branch is chosen at trigger
   time; by default it's the project's main branch.
2. **Queue.** Each project has its own pg-boss queue whose jobs run strictly one at a
   time: builds of one project never run in parallel, builds of different projects may.
   The queue lives in PostgreSQL and survives restarts.
3. **Clone.** The backend decrypts the deploy key, writes it to a temporary file
   (mode `600`) and clones the branch with the system `git` into a fresh `repo-*`
   directory inside `RANGER_WORKDIR_HOST_PATH`. The temporary key is removed right after.
4. **Steps `install` → `test` → `build`.** Each non-empty step is a separate run of the
   `ranger-builder:latest` container with the checkout mounted at `/workspace`. Empty
   steps are skipped. The first failing step stops the build; the rest are marked
   `skipped`. Output streams to the log and over WebSocket.
5. **The `deploy` step** is added only if the project has both ports set **and** the
   main branch is being built. Building any other branch runs install/test/build but
   does not replace the running version.
6. **Finish.** The checkout is moved to `projects/<id>` (one copy per project, the
   previous one is replaced) — the file browser and the working-directory terminal
   read from it. The build gets status `success` or `failed`.

If the backend restarts mid-build, on startup the build is marked `failed` with a note
in the log, and unfinished checkouts are removed.

**What counts as a failure:** a non-zero exit code from a step, a timeout (15 minutes
per step — the container is killed with `SIGKILL`), a failed clone (wrong URL, no
access) or a deploy error. The cause is always visible in the build log in the UI.

### Steps and the build image

Steps run as `sh -c "<your command>"` in `ranger-builder:latest`
(`apps/backend/docker/builder.Dockerfile`): Node 20, Bun, Python 3 + pip,
build-essential, curl, unzip. If your project needs something else, install it in
`install` (the network is on in build steps) or extend the image and rebuild it:

```bash
docker rmi ranger-builder:latest
docker compose restart backend      # the backend rebuilds the image on start
```

Inside the container: working directory `/workspace` (the checkout, writable),
512 MB memory, 1 CPU, 256 processes, all capabilities dropped, `no-new-privileges`,
no Docker socket.

## Deploy

If a project has a container port and a host port, after the build steps succeed:

1. A `Dockerfile` must exist at the checkout root; otherwise the deploy fails with a
   clear message.
2. An image `ranger-deploy-<project id>:<build id>` is built from the checkout. If the
   image build fails, the old container is left alone.
3. The project's previous container is stopped and removed.
4. A new container `ranger-deploy-<project id>` is created: the container port is
   published on the host port, project environment variables are passed as `Env`, the
   restart policy is `unless-stopped`. The container joins the same Docker networks as
   the backend (so the health check can reach it by name).
5. **Health check:** a TCP connection to the container port, up to 30 seconds, polled
   once a second. It only verifies that the port is listening, not an HTTP response.
6. On failure Ranger stops the new container and starts the image of the last
   successful deploy (automatic rollback). If there's nothing to roll back to, there
   simply is no container.

Every attempt is recorded in the deploy history. **Manual rollback** is a button on any
entry with status "success": the image is already in Docker, so nothing is rebuilt —
the container is switched to it and goes through the same health check.

Old images aren't deleted automatically (they're needed for rollback). If disk space
runs low: `docker image prune`, or remove unneeded `ranger-deploy-*` images by hand.

When a project is deleted, its container is stopped and removed.

## Docker Compose deploy

The second deploy mode, for projects made of several services: an app, a database,
a worker and so on. Instead of a single container, Ranger runs `docker compose up`
with a compose file from the repository.

### Enabling it

Admin only: "Edit project" → the "Deploy mode" card → **Docker Compose** and the file
path relative to the repository root (`docker-compose.yml` by default). The change is
written to the audit log (`change_deploy_mode`).

- Switching modes stops whatever was deployed in the old mode: the single container is
  removed, or the compose project gets `docker compose down`.
- The new mode takes effect from the next build of the main branch.
- The project's ports aren't used in this mode — the compose file publishes its own
  (`ports:`).

### What happens on deploy

After install/test/build succeed:

1. The checkout is copied into a directory for this deploy:
   `<RANGER_WORKDIR_HOST_PATH>/deploys/<project id>/<build id>`.
2. Ranger runs:
   ```bash
   docker compose -p ranger-compose-<project id> -f <file> \
     up -d --build --remove-orphans --wait --wait-timeout 120
   ```
   `--build` builds images for services with `build:`. `--wait` waits for every
   service to start and for services with a `healthcheck` to become healthy.
3. If compose exits with an error or doesn't finish within 20 minutes, the deploy is
   marked failed. Services **stay as they are** — this mode has no rollback; the cause
   is in the build log.
4. The current and previous deploy directories are kept; older ones are deleted.

Each deploy lives in a new directory. So compose recreates services with relative bind
mounts (`./nginx.conf:/etc/nginx/nginx.conf`) with fresh files, and leaves services
without them (say, a database on a named volume) alone unless their image or config
changed.

### Compose file requirements

- **Data only in named volumes** (`db-data:/var/lib/postgresql/data`) or absolute host
  paths. A relative path (`./data:/data`) points into one deploy's directory, which is
  deleted a deploy later — the data will be lost.
- **`restart: unless-stopped`** — set it yourself, otherwise services won't come back
  after a server reboot.
- **A `healthcheck`** on every long-running service is recommended — without one,
  `--wait` considers the service ready as soon as its container starts.
- **Ports** go in `ports:`; make sure they don't clash with other projects on the server.
- If a service needs the Docker socket or a host path, mount them explicitly, with an
  absolute host path. For working directories a service hands to the Docker daemon,
  the path inside the container must match the path on the host.

### Environment variables in compose

Compose receives **only** the project's variables (plus `PATH`, `HOME`, `DOCKER_HOST`),
not Ranger's own environment. That way a compose file can't pull in
`DEPLOY_KEY_ENCRYPTION_KEY` or `SESSION_SECRET`. Use them in two ways:

```yaml
services:
  app:
    environment:
      API_URL: ${API_URL}      # substitute the value
      SECRET_TOKEN:            # pass the variable through as is
```

Compose also reads a `.env` next to the compose file, as usual. Don't put secrets
there — that's what project variables are for.

### What this mode doesn't have

- **Rollback** — neither automatic nor manual. To go back, rebuild the commit (branch)
  you need, or fix and build again.
- **A shell in the container** on the "Console" tab — a compose project has several
  services. The working-directory shell works.
- **Metrics on the project tab** — the services are on the "Containers" page, grouped
  under the project name, along with their logs.

### Compose mode security

A compose file can request `privileged`, the Docker socket, or mount the host's `/` —
that is, get root on the server. Therefore:

- **only an admin** enables the mode and changes the file path, and it's audited;
- **only an admin** changes a compose project's repository and branch — otherwise an
  operator could swap in a different compose file;
- anyone who can push to the repository's main branch effectively has root on the
  server. Enable this mode only for your own repositories.

Operators can still change the project's environment variables. If the compose file
substitutes them into paths (`- ${DATA_DIR}:/data`), that's another way to mount an
arbitrary host path — don't use variables in `volumes:`.

### Deleting the project

Ranger runs `docker compose down --remove-orphans` and deletes the deploy directories.
**Named volumes are kept** — remove them by hand if you don't need the data:

```bash
docker volume ls --filter label=com.docker.compose.project=ranger-compose-<project id>
docker volume rm <name>
```

Service images (`ranger-compose-<id>-<service>`) left over from rebuilds dangle:
`docker image prune`.

## Project environment variables

Project settings → "Environment variables". The values reach:

- **every build step** (`install`, `test`, `build`) as ordinary process variables;
- the **deployed container** (on deploy, automatic rollback and manual rollback).

Rules:

- A name is Latin letters, digits and `_`, not starting with a digit. Up to 200
  variables per project.
- Values are stored encrypted and the UI **never shows them** after saving: a saved
  variable's value field is empty, and empty means "keep". To change a value, type a new
  one; to delete, use the ×.
- You can paste the contents of a ready `.env` (`KEY=value`, `#` comments, optional
  `export`, quoted values). Multi-line values aren't supported.
- An admin can view the values with "Show values" — this is written to the audit log
  (`reveal_project_env`).
- Changes apply **from the next build or deploy**. Saving does not restart a running
  container.
- Values of 8 or more characters are masked (`***`) in the build log. Shorter ones
  (`PORT=3000`, `DEBUG=true`) are not, so the log stays readable. Masking applies to the
  build log only: if the app prints secrets to its own stdout, they'll be visible in
  the container logs.
- Rollback uses the project's **current** variables, not the ones the image was
  deployed with: earlier values aren't stored.

## Metrics

- **Host:** CPU, RAM, disk. Read from `/proc` (which reflects the host inside the
  container) and from the disk holding the build checkouts.
- **Containers:** CPU and RAM of every running container through the Docker API
  (`stats`), not Prometheus.
- Sampled every 5 seconds, updated live over WebSocket, with a chart for the last hour.
- History is kept **in the backend's memory** and is lost on restart. There are no
  long-term metrics: that takes Prometheus/Grafana, and Ranger doesn't replace them.

## Terminal

The project's "Console" tab, `admin` only. This is not a host shell; two options exist.

- **Shell in the project's container** — `exec` into the project's deployed container
  (the project must be deployed as a single container, and the container running).
- **Shell in the working directory** — a throwaway `ranger-builder` container over the
  last checkout, `/workspace`. No network, 512 MB, 1 CPU, 256 processes.

Flow and limits:

1. Before the first entry (and every 5 minutes) the password is requested — a separate
   confirmation on top of the regular session.
2. The attempt is written to the audit log (`open_terminal`) **before** the shell starts.
3. A session is capped at 30 minutes regardless of activity; when the tab closes, the
   terminal container is removed.

## Files

The project's "Files" tab — a read-only view of the last checkout, available to all
roles. Limits: text files up to 1 MB (binary and large files are shown as "cannot be
opened"); escaping the checkout, including through a symlink in the repository, is
blocked. A checkout exists after the first build.

## Triggers and cron

A project has two trigger modes: `manual` and `cron`. In cron mode you give an ordinary
five-field expression (`*/30 * * * *`, `0 3 * * *`). The schedule uses the backend
process's timezone (UTC by default). Cron always builds the main branch. Such builds
aren't written to the audit log — there's no "user", and the "triggered by" field says
`cron`.

## Roles

| Capability | viewer | operator | admin |
|---|:-:|:-:|:-:|
| View projects, builds, logs, deploys, containers, metrics, files | ✓ | ✓ | ✓ |
| Trigger a build | | ✓ | ✓ |
| Create, edit and delete projects | | ✓ | ✓ |
| Replace the deploy key, edit environment variables | | ✓ | ✓ |
| Roll back a deploy | | ✓ | ✓ |
| Deploy mode (Docker Compose), a compose project's repository and branch | | | ✓ |
| View the decrypted deploy key and variable values | | | ✓ |
| Terminal | | | ✓ |
| Manage users | | | ✓ |
| Audit log | | | ✓ |

Permissions are checked on the server on every request and the role is read from the
database: changing a role or disabling a user takes effect immediately, without a
re-login. A user can't be deleted (audit records reference them) — only disabled. You
can't disable or demote yourself, so you can't lock yourself out of admin.

A user with a temporary password (new, reset, or the first admin) can only change the
password; the rest of the API and WebSocket is closed to them.

## Audit log

Visible to admins only, on the "Audit log" tab. Recorded: a user triggering a build, a
deploy rollback, a deploy-mode change, viewing a deploy key, viewing environment variables, entering the
terminal, creating and changing users, and password resets. Each entry shows who, what,
on what, and when.

## Public status page

`/status` is available without logging in. It shows only projects with "Show on the
public status page" enabled: name, the status of the last build and its time. No logs,
repository URL or branches. A project is not public by default.

## Configuration

Variables in the root `.env` (read by `docker-compose.yml`):

| Variable | Required | Description |
|---|:-:|---|
| `SESSION_SECRET` | yes | Cookie session signing secret |
| `DEPLOY_KEY_ENCRYPTION_KEY` | yes | Encryption key for deploy keys and environment variables. Don't change after the first stored secret |
| `RANGER_WORKDIR_HOST_PATH` | yes | Absolute host path for build checkouts |
| `ADMIN_EMAIL` | on first start | Email of the first administrator |

Variables compose passes to the backend (set in `apps/backend/.env` when running
without compose):

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | — | PostgreSQL connection string |
| `PORT` | `3000` | Backend port |
| `BUILD_WORKDIR_HOST_PATH` | — | Checkout path on the host (in compose = `RANGER_WORKDIR_HOST_PATH`) |
| `BUILD_WORKDIR_CONTAINER_PATH` | `/data/build-workdir` | The same directory as the backend sees it. In compose it equals `RANGER_WORKDIR_HOST_PATH`: compose deploy requires the paths to match |
| `BUILD_LOGS_DIR` | `data/build-logs` | Build log directory |

Values hard-coded in `apps/backend/src` (change them by rebuilding):

| What | Value | Where |
|---|---|---|
| Build step timeout | 15 min | `builds/build-runner.service.ts` |
| Build step memory / CPU | 512 MB / 1 | `builds/build-runner.service.ts` |
| Health check timeout | 30 s | `deployments/deploy-runner.service.ts` |
| Terminal password re-prompt | 5 min | `terminal/terminal.gateway.ts` |
| Terminal session maximum | 30 min | `terminal/terminal.gateway.ts` |
| Metrics interval, history | 5 s, 1 hour | `metrics/` |

## Data storage and backups

| What | Where |
|---|---|
| Projects, builds, users, audit, queue, sessions | PostgreSQL, volume `postgres-data` |
| Build logs (`<build id>.log`) | volume `build-logs` |
| Build checkouts and each project's last checkout | `RANGER_WORKDIR_HOST_PATH` on the host |
| Compose deploy directories (current and previous) | `RANGER_WORKDIR_HOST_PATH/deploys` |
| Images of deployed apps | the host's Docker (`ranger-deploy-*`, `ranger-compose-*`) |
| Compose service data | named volumes `ranger-compose-<id>_*` |

For a backup, **the database and `DEPLOY_KEY_ENCRYPTION_KEY`** are enough. Without the
encryption key, stored deploy keys and environment variables can't be decrypted even
with a copy of the database. The rest is recoverable: checkouts reappear on the next
build.

```bash
docker compose exec postgres pg_dump -U ranger ranger > ranger-backup.sql
```

## API reference

All paths are prefixed with `/api`. Authentication is a cookie session
(`POST /auth/login`). The format is JSON. Errors come as `{ "message": "..." }` with an
HTTP status.

**Authentication**

| Method and path | Role | Description |
|---|---|---|
| `POST /auth/login` | — | `{ email, password }` → user, cookie |
| `POST /auth/logout` | — | Ends the session |
| `GET /auth/me` | any | Current user |
| `POST /auth/change-password` | any | `{ currentPassword, newPassword }` |
| `POST /auth/reauth` | admin | `{ password }` — confirmation for the terminal |

**Projects**

| Method and path | Role | Description |
|---|---|---|
| `GET /projects`, `GET /projects/:id` | any | List / one project (no secrets; `envKeys` is names only) |
| `POST /projects` | operator | Create a project (optionally with `env`) |
| `PATCH /projects/:id` | operator | Change settings |
| `DELETE /projects/:id` | operator | Delete the project and its deploy |
| `PUT /projects/:id/deploy-mode` | admin | `{ mode: "container" \| "compose", composeFile }` (audited) |
| `POST /projects/check-repository` | operator | `{ gitUrl, deployPrivateKey }` → branch list |
| `GET /projects/:id/branches`, `GET /projects/:id/commits` | any | Branches, recent commits |
| `POST /projects/:id/deploy-key` | operator | Replace the deploy key |
| `POST /projects/:id/deploy-key/reveal` | admin | Decrypted key (audited) |
| `PUT /projects/:id/env` | operator | `{ variables: [{ key, value? }] }` — the full list |
| `POST /projects/:id/env/reveal` | admin | Decrypted variables (audited) |

**Builds and deploys**

| Method and path | Role | Description |
|---|---|---|
| `POST /projects/:id/builds` | operator | `{ branch? }` — queue a build |
| `GET /projects/:id/builds`, `GET /builds/:id` | any | History / a build with its steps |
| `GET /projects/:id/deployments` | any | Deploy history |
| `POST /projects/:id/deployments/:deploymentId/rollback` | operator | Roll back to an earlier successful deploy (single-container mode only) |

**Everything else**

| Method and path | Role | Description |
|---|---|---|
| `GET /containers` | any | All containers on the host |
| `GET /metrics/host`, `GET /metrics/containers/:id` | any | One-hour metrics history |
| `GET /projects/:id/files?path=`, `.../files/content?path=` | any | Checkout directory / file content |
| `GET /users`, `POST /users`, `PATCH /users/:id`, `POST /users/:id/reset-password` | admin | User management |
| `GET /audit-log` | admin | Audit log |
| `GET /public/status` | — | Public status (no login) |

## WebSocket

The same address, `socket.io`, authorized by the same session (a connection without a
login or with a pending password change is rejected).

| Namespace | Client → server | Server → client |
|---|---|---|
| `/` (builds) | `subscribe` (build id) | `log` (line), `steps`, `status` |
| `/containers` | `subscribe` (container id), `unsubscribe` | `log` (line; the last 200 first) |
| `/metrics` | — | `host`, `container` (every 5 s, to everyone connected) |
| `/terminal` | `start` (`{ projectId, target }`), `input`, `resize`, `stop` | shell output, error codes and close reasons |

## Data model

The schema is `apps/backend/prisma/schema.prisma`; migrations are applied on start.

```
users        email, role, disabled, must_change_password
projects     git_url, branch, install/test/build_cmd, trigger_mode, cron_expr,
             container_port, host_port, deploy_mode, compose_file, is_public,
             env_keys, encrypted_env
deploy_keys  encrypted private key (1:1 with a project)
builds       project_id, status, branch, triggered_by, steps (jsonb)
test_results result of the test step
deployments  build_id, container_id, image_tag, status, rolled_back
audit_log    user_id, action, target, created_at
```

## Troubleshooting

**The UI returns 502 after start.** The backend is still building the `ranger-builder`
image (a few minutes on first start). Follow `docker compose logs -f backend`.

**The backend crashes: "BUILD_WORKDIR_HOST_PATH не задан".** `.env` has no
`RANGER_WORKDIR_HOST_PATH`, or the path isn't absolute.

**Build: `Permission denied (publickey)` while cloning.** The public half of the deploy
key wasn't added to the repository, or the wrong private key was pasted into Ranger.
Check with the "Check repository" button.

**Build fails, files not found / empty `/workspace`.** `RANGER_WORKDIR_HOST_PATH` must
be the same path on the host and in the backend's volume. Don't change it on a running
system without recreating the container.

**Deploy: "в корне репозитория нет Dockerfile" (no Dockerfile in the repo root).**
Deploy builds an image from the `Dockerfile` in the root. Either add one or clear the
ports in the project settings.

**Deploy: health check failed.** The app didn't start listening on the container port
within 30 seconds, or the wrong port is set. Check the container logs on the
"Containers" tab.

**Deploy: host port in use.** Something already listens on that port — pick another.

**Compose deploy: "требует, чтобы рабочая директория была смонтирована… по тому же
пути" (the working directory must be mounted at the same path).** The backend sees
checkouts at a different path than the host does. In Ranger's `docker-compose.yml` the
volume must be `${RANGER_WORKDIR_HOST_PATH}:${RANGER_WORKDIR_HOST_PATH}` and
`BUILD_WORKDIR_CONTAINER_PATH` must equal `RANGER_WORKDIR_HOST_PATH` (the default setup).
When running the backend without compose, set `BUILD_WORKDIR_CONTAINER_PATH` and
`BUILD_WORKDIR_HOST_PATH` to the same value in `apps/backend/.env`.

**Compose deploy: "в репозитории нет docker-compose.yml" (no compose file in the
repository).** The file path in the deploy mode doesn't match the repository — fix it
in the "Deploy mode" card.

**Compose deploy fails at `--wait`.** A service exited or didn't become healthy within
120 seconds. The build log has compose's output; the service's own logs are on the
"Containers" page or via `docker compose -p ranger-compose-<id> logs`.

**Compose services didn't come back after a server reboot.** The compose file lacks
`restart: unless-stopped`.

**Forgot the administrator password.**
`docker compose exec backend node dist/cli/reset-password.js <email>`.

**Stored keys and variables don't decrypt.** `DEPLOY_KEY_ENCRYPTION_KEY` changed. Put
the previous value back; if it's lost, the keys and variables must be entered again.

## Limitations and plans

- **One host.** No orchestration, clusters or multiple servers.
- **API errors are Russian-only.** The backend returns ready-made Russian text, so
  error messages aren't translated in EN mode. The right fix is returning error codes
  and translating them on the frontend — already done for the terminal.
- **Limits for deployed containers.** Build steps are limited, but `ranger-deploy-*`
  containers currently run without CPU and memory limits.
- **The health check is TCP only.** An HTTP path check isn't supported.
- **Compose deploy has no rollback**, no container shell and no metrics on the project
  tab. Rollback needs per-build service images — the next stage.
- **Metrics cover one hour** and don't survive a restart.
- **No notifications** (Telegram and others are not planned).

## Contributing and license

The project is maintained by hand; code rules are in [CLAUDE.md](./CLAUDE.md). Run
`bun run lint` and `bun run build` before changing anything.

Ranger is released under the [Apache License 2.0](./LICENSE). The
[sandbox-executor](https://github.com/RunForest1/sandbox-executor) module is a separate
project with its own license (MIT).
