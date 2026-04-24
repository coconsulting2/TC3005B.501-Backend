# TC3005B.501-Backend

![Tests](https://github.com/coconsulting2/TC3005B.501-Backend/actions/workflows/ci.yml/badge.svg)
![E2E Tests](https://github.com/coconsulting2/TC3005B.501-Backend/actions/workflows/e2e-ci.yml/badge.svg)

---

API and Database for the connection and the functioning of the trip management system portal developed in course 
TC3005B by group 501.

## Getting Started

In order to run this Backend, the following steps are required:

### Installing

The only option currently is to clone the repository locally from GitHub.

#### Using `git`

```sh
git clone https://github.com/coconsulting2/TC3005B.501-Backend.git 
```

#### Using `gh` (GitHub CLI)

```sh
gh repo clone coconsulting2/TC3005B.501-Backend
```

### Dependencies

This project uses [Bun](https://bun.com/) as its package manager and script runner. Install dependencies from the root of the repository:

```sh
bun install
```

> Bun is used for installs and tooling (`bunx prisma`, `bun run`). The long-running server itself is started with Node — see [Running](#running) below.

### Create HTTPS certificates

To successfully create the certificates to use the server with HTTPS you will need to follow the next steps:

#### Configuring OpenSSL

> [!Important]
> You have to download the `.cnf` file provided in SharePoint and place it in the [`/certs`](/certs) directory.

#### Generating keys and certificates

1. Access the [`/certs`](/certs) directory.

    ```sh
    cd certs
    ```

2. Run the next line of code in the terminal to ensure the [`/certs/create_certs.sh`](/certs/create_certs.sh) file is executable:

    ```sh
    chmod +x create_certs.sh
    ```

3. Run this line of code to create the certificates:

    ```sh
    ./create_certs.sh
    ```

Now you should have 6 new files in the [`/certs`](/certs) directory and should be able to run the server using HTTPS.

> [!Caution]
> After creating the certificates, when making a commit be sure not to be uploading the certificates to the repository.

### Configuring the Database

The relational store is **PostgreSQL**, accessed through [Prisma](https://www.prisma.io/). Schema lives in [`prisma/schema.prisma`](/prisma/schema.prisma).

#### Setup PostgreSQL

1. Install Postgres 14+ for your platform (or use the Docker stack — see [Running with Docker](#running-with-docker)).
2. Create a database and user, then set `DATABASE_URL` in your `.env` (see [`.env.example`](/.env.example)):
    ```ini
    DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/CocoScheme?schema=public
    ```
3. Apply the schema and seed reference + dummy data:
    ```sh
    bun run dummy_db   # schema + reference data + dummy data (development)
    bun run empty_db   # schema + reference data only
    ```

### Setup MongoDB
1. [Download `mongodb`](https://www.mongodb.com/docs/manual/installation/) using your preferred method or package manager.
2. [Download `mongosh`](https://www.mongodb.com/try/download/shell) if you want to interact with the database directly (recommended).
3. Test that mongo was installed correctly by running the `mongod` or `mongosh` command. `mongod` will usually return error codes since no connection is currently made to then database.
4. Verify that mongo is running using ` systemctl status mongod `
5. If the status appears as inactive, use the command ` systemctl start mongod `
### Environment Variables

Copy [`.env.example`](/.env.example) to `.env` and fill in the values:

```sh
cp .env.example .env
```

The required variables are: `PORT`, `NODE_ENV`, `DATABASE_URL`, `MONGO_URI`, `CORS_ORIGIN`, `AES_SECRET_KEY` (exactly 32 characters), `JWT_SECRET`, `MAIL_USER`, `MAIL_PASSWORD`.

### Running

With Postgres and MongoDB running and your `.env` populated:

```sh
bun run dev    # node --watch index.js
```

You should see the ASCII banner and `🚀 Server running on port 3000 with HTTPS`.

---

## Running with Docker

The repository ships a multi-target Dockerfile (`deps` for dev, `production` for GHCR) plus two compose files.

### Local development with hot-reload

```sh
bun run docker:dev                # foreground, streams logs
bun run docker:dev:build          # rebuild image first
bun run docker:dev:down           # stop containers (keeps data)
bun run docker:dev:clean          # stop AND wipe volumes (full reset)
bun run docker:data:reset         # wipe Postgres + re-seed (keeps containers up)
bun run docker:permissions:sync   # re-apply reference seed only (idempotent) — run after pulling a PR that adds permissions
```

`docker-compose.dev.yml` brings up Postgres 16 + Mongo 7 + a one-shot `migrate` service (installs deps, applies the Prisma schema, seeds reference + dummy data) + the backend with the source bind-mounted and `node --watch` running. Edits on the host hot-reload the server inside the container. HTTPS certs are auto-generated into a named volume on first start.

The migrate service runs **every** `up`: the reference-data seed (roles, request statuses, **permissions**) is idempotent (`upsert` + `createMany({skipDuplicates:true})`) so new permissions added by teammates' PRs land automatically on your machine without a full wipe. Dummy data is gated by a sentinel inside the `node_modules_dev` volume, so it only runs on first boot. See [cocowiki — sistema de permisos](https://github.com/coconsulting2/cocowiki/blob/main/docs/permisos.md) for the workflow of adding new permissions.

### Quickstart for end-users (uses the published image from GHCR)

```sh
curl -O https://raw.githubusercontent.com/coconsulting2/TC3005B.501-Backend/main/docker-compose.yml
docker compose up -d
```

The first start auto-generates self-signed HTTPS certs, applies the Prisma schema, and seeds dummy data. Subsequent starts reuse the certs and skip the seed.

### Image tags

| Tag                                                     | Description                 |
|---------------------------------------------------------|-----------------------------|
| `ghcr.io/coconsulting2/tc3005b-501-backend:latest`      | Latest commit on `main`     |
| `ghcr.io/coconsulting2/tc3005b-501-backend:sha-<short>` | Pinned to a specific commit |

### Overriding secrets

Place a `.env` file next to the compose file with overrides:

```ini
AES_SECRET_KEY=your_32_character_secret_key_here
JWT_SECRET=your_real_jwt_secret
MAIL_USER=...
MAIL_PASSWORD=...
```

### Wiping persistent state

```sh
docker compose down
docker volume rm cocoscheme_pgdata cocoscheme_mongodata cocoscheme_certs
```

> Wiping the `certs` volume regenerates the CA, so you may need to re-trust the new certificate in your browser/keychain after the next `docker compose up`.
