# Skill share codes

A 6-digit skill share code created on one computer can be redeemed on
another. Knowing the code is enough. This version does not have user
accounts or a per-user ownership list.

Skill **files** stay on disk (`~/.agents/skills/`, project `.agents/skills/`,
and the bundled public catalog). Only the share-code row is stored in MySQL.

## Where the API runs

The browser calls Canvas, not the agent-server:

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/canvas/skill-share-codes` | `POST` | Mint a code. The same `skillName` + `skillPath` returns the existing code. |
| `/api/canvas/skill-share-codes/:code` | `GET` | Redeem lookup. |
| `/api/canvas/skill-share-codes/:code` | `PATCH` | `{ "skillTitle": "…" }` after the short title is known. |

`GET` on the collection is rejected. There is no list-all endpoint.

These handlers run **before** `/api/*` is proxied to the agent-server:

- `npm run dev`, `npm run dev:static`, and the Electron app: `scripts/ingress.mjs` (the URL you open in the browser).
- `npx @openhands/agent-canvas`, the Docker image, and the static half of `dev:static`: `scripts/static-server.mjs`.
- `npm run dev:minimal`: a Vite `configureServer` middleware, because that launcher has no ingress.

Auth reuses the deployment session key. When one is configured, send
`X-Session-API-Key` (the same key the rest of the stack already uses). If no
session key is configured, the API is open on that process. There is no
separate login.

The browser may cache codes it has minted or redeemed in `localStorage`
(`openhands-skill-share-codes`) for the saved-code list. Redeem always asks
the server. A code that exists only in that cache cannot be redeemed.

If MySQL is not configured, mint and redeem return **503**
`mysql_unconfigured`. They do not fall back to `localStorage`.

## Create the database

```sql
CREATE DATABASE IF NOT EXISTS agent_canvas
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

Grant the Canvas user permission to create tables in that database. The API
runs `CREATE TABLE IF NOT EXISTS` on first use (`scripts/skill-share-codes-schema.sql`,
embedded in `scripts/skill-share-codes-api.mjs`). You can also apply the SQL
file yourself:

```bash
mysql -h "$MYSQL_HOST" -u "$MYSQL_USER" -p "$MYSQL_DATABASE" \
  < scripts/skill-share-codes-schema.sql
```

`code` is the primary key. `skill_identity` is `sha256(skill_name + "\n" + skill_path)`
and is unique, which is what makes minting the same skill idempotent.
`revoked_at` is reserved for a later soft-delete and is unused in v1.

## Environment

Either one URL:

```bash
export MYSQL_URL='mysql://canvas:secret@127.0.0.1:3306/agent_canvas'
```

or separate fields (`MYSQL_PORT` defaults to `3306`; `MYSQL_PASSWORD` may be empty):

```bash
export MYSQL_HOST=127.0.0.1
export MYSQL_PORT=3306
export MYSQL_USER=canvas
export MYSQL_PASSWORD=secret
export MYSQL_DATABASE=agent_canvas
```

`MYSQL_URL` wins when both styles are set. Setting some of
`MYSQL_HOST` / `MYSQL_USER` / `MYSQL_DATABASE` / `MYSQL_PORT` / `MYSQL_PASSWORD`
without the required host, user, and database is a 503, not a silent fallback.

Start the process with those variables in the environment. Child processes
(ingress, static-server, Vite) inherit them.

### `npm run dev` / `npx @openhands/agent-canvas`

```bash
export MYSQL_URL='mysql://canvas:secret@127.0.0.1:3306/agent_canvas'
npm run dev
# or, for a published install:
npx @openhands/agent-canvas
```

Open the ingress URL (`http://localhost:8000` by default). Creating a skill
from 「创建技能码」 writes the code to MySQL. On another machine pointed at
the same database, 「使用技能码」 looks the code up and starts a chat with
`/{skillName}`.

### Docker

Pass the same variables into the container. `static-server` inside the image
serves the API and already includes the `mysql2` client:

```bash
docker run --rm -p 8000:8000 \
  -e MYSQL_HOST=host.docker.internal \
  -e MYSQL_PORT=3306 \
  -e MYSQL_USER=canvas \
  -e MYSQL_PASSWORD=secret \
  -e MYSQL_DATABASE=agent_canvas \
  ghcr.io/openhands/agent-canvas:latest
```

### systemd

Add the variables to the service unit from
[SELF_HOSTING.md](./SELF_HOSTING.md), for example
`Environment=MYSQL_URL=mysql://canvas:secret@127.0.0.1:3306/agent_canvas`.
