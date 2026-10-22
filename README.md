# Drone Dispatch Service

REST API for managing a fleet of drones that deliver medication.

Built with Node.js, TypeScript, NestJS, PostgreSQL and Prisma.

- Register drones and list the ones ready for loading
- Load medications without ever going over a drone's weight limit, even under parallel requests
- Safe retries for loads with an `Idempotency-Key`
- Move drones through their delivery states
- Check battery levels, with a background job that keeps a battery audit log
- Retire drones without losing their history

## Requirements

- Docker with Docker Compose
- Node.js 24 (only for running without Docker)

## Quick start

```bash
docker compose up --build
```

On start, a one-off `migrate` service applies database migrations and loads the seed data, then exits. The API starts only after it finishes successfully.

- API: `http://localhost:3000/api/v1`
- Docs (Swagger): `http://localhost:3000/docs` (opening `http://localhost:3000` takes you there too)
- Health check: `http://localhost:3000/health`

Every API request needs the header `x-api-key`. With Docker Compose the key is `local-dev-api-key-change-me`. In Swagger, click **Authorize** and paste it.

## Run without Docker

```bash
cp .env.example .env
docker compose up -d db
npm ci
npx prisma generate
npx prisma migrate deploy
npm run db:seed
npm run start:dev
```

## API

All endpoints are under `/api/v1` and need the `x-api-key` header. Weights are in grams.

| Requirement                              | Endpoint                                                    |
| ---------------------------------------- | ----------------------------------------------------------- |
| Register a drone                         | `POST /drones`                                              |
| Check available drones for loading       | `GET /drones?available=true`                                |
| Load a drone with medication             | `POST /drones/:id/load`                                     |
| Check loaded medication for a drone      | `GET /drones/:id/medications`                               |
| Check battery level for a drone          | `GET /drones/:id/battery`                                   |
| Periodic battery check with an audit log | Background job, read with `GET /drones/:id/battery/history` |

| Method | Path                          | What it does                                                                                                           |
| ------ | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| POST   | `/drones`                     | Register a drone. It starts IDLE and empty                                                                             |
| GET    | `/drones`                     | List drones. Filters: `available`, `state`, `includeRetired`, `page`, `limit`                                          |
| GET    | `/drones/:id`                 | Get one drone                                                                                                          |
| POST   | `/drones/:id/transitions`     | Move a drone to its next state, e.g. `{ "to": "LOADED" }`                                                              |
| POST   | `/drones/:id/load`            | Load medications, e.g. `{ "items": [{ "code": "PARA_500", "quantity": 2 }] }`                                          |
| GET    | `/drones/:id/medications`     | Medications on the drone's current delivery                                                                            |
| GET    | `/medications`                | Medication catalogue. Filters: `page`, `limit`                                                                         |
| POST   | `/medications`                | Add a medication, e.g. `{ "name": "Vitamin_C_500mg", "code": "VITC_500", "weightG": 12.5, "imageUrl": "https://..." }` |
| GET    | `/drones/:id/battery`         | Battery level and whether it is too low to load                                                                        |
| PATCH  | `/drones/:id/battery`         | Set the battery level, e.g. `{ "batteryPct": 40 }`. Stands in for drone telemetry                                      |
| GET    | `/drones/:id/battery/history` | Battery audit log, newest first. Filters: `page`, `limit`                                                              |
| POST   | `/drones/:id/retire`          | Take a drone out of service and keep its history, e.g. `{ "reason": "Motor failure" }`                                 |

Example:

```bash
curl -X POST http://localhost:3000/api/v1/drones \
  -H 'x-api-key: local-dev-api-key-change-me' \
  -H 'content-type: application/json' \
  -d '{"serialNumber":"DRN-NEW-001","model":"Middleweight","weightLimitG":300,"batteryPct":90}'
```

### Loading

Each load runs in one database transaction that locks the drone's row, so two loads on the same drone wait for each other and can never go over the weight limit together. Loads on other drones are not affected.

Send an `Idempotency-Key` header to make a load safe to retry. The same key with the same body returns the first response (with `idempotent-replayed: true`) and loads nothing new. The same key with a different body is rejected. Keys expire after `IDEMPOTENCY_KEY_TTL_HOURS`.

### Retiring a drone

Drones are never deleted, because their deliveries and battery history must stay. `POST /drones/:id/retire` takes an IDLE drone out of service instead. A retired drone:

- is hidden from `GET /drones` (add `includeRetired=true` to see it) and never shows as available
- cannot be loaded, moved to another state or have its battery updated (409 `CONFLICT`)
- does not count towards `FLEET_CAPACITY`, so a replacement can be registered
- is skipped by the battery audit
- keeps its serial number, details and history readable

Retiring twice returns the drone unchanged. A drone that is not IDLE gets 409 `CONFLICT`. Not built yet: bringing a drone back into service, and recording who retired it (needs user accounts).

### Battery audit

Every `BATTERY_CHECK_INTERVAL_MS` a background job writes each drone's battery level and state to the audit log in batched inserts, all with the same time. A run is skipped if the last one is still going, and only one app instance writes the log at a time (Postgres advisory lock). A failed run is logged and the next one tries again.

If a drone's battery drops below `MIN_LOADING_BATTERY_PCT` while it is LOADING, it stays LOADING but cannot take more load until the battery is back up.

A drone can be loaded when its battery is at least `MIN_LOADING_BATTERY_PCT` and it is IDLE, or LOADING with space left.

Allowed state changes:

```
IDLE -> LOADING -> LOADED -> DELIVERING -> DELIVERED -> RETURNING -> IDLE
LOADING -> IDLE (cancel)
```

Going back to IDLE closes the delivery and empties the drone. Moving to LOADING or LOADED needs enough battery, and LOADED needs something on board.

Errors use 8 codes. The `message` says exactly what went wrong, and `details` carries the numbers where they help (for example the current, requested and limit weight when a load is too heavy).

| Code                   | Status   | When                                                                                                                                                                                                                                             |
| ---------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `VALIDATION_ERROR`     | 400, 413 | Bad fields, broken JSON, a bad id, or a body that is too large                                                                                                                                                                                   |
| `UNAUTHORIZED`         | 401      | Missing or wrong API key                                                                                                                                                                                                                         |
| `NOT_FOUND`            | 404      | Unknown drone, unknown medication codes, or unknown route                                                                                                                                                                                        |
| `CONFLICT`             | 409      | Duplicate serial or code, fleet full, a state change that isn't allowed, a drone that isn't free to load or retire, a retired drone, an `Idempotency-Key` reused for a different request, or another request changing the same drone (try again) |
| `UNPROCESSABLE_ENTITY` | 422      | Over the weight limit, or battery too low to load                                                                                                                                                                                                |
| `RATE_LIMITED`         | 429      | Too many requests                                                                                                                                                                                                                                |
| `SERVICE_UNAVAILABLE`  | 503      | Database is down                                                                                                                                                                                                                                 |
| `INTERNAL_ERROR`       | 500      | Anything unexpected                                                                                                                                                                                                                              |

## Seed data

The database is loaded with 8 drones and 8 medications on start. The seed only adds rows that are missing, so running it again never duplicates data or undoes your changes.

| Serial number | Model         | Weight limit | Battery |
| ------------- | ------------- | ------------ | ------- |
| DRN-LW-001    | Lightweight   | 150g         | 100%    |
| DRN-LW-002    | Lightweight   | 150g         | 20%     |
| DRN-MW-001    | Middleweight  | 250g         | 85%     |
| DRN-MW-002    | Middleweight  | 250g         | 25%     |
| DRN-CW-001    | Cruiserweight | 375g         | 60%     |
| DRN-CW-002    | Cruiserweight | 375g         | 10%     |
| DRN-HW-001    | Heavyweight   | 500g         | 95%     |
| DRN-HW-002    | Heavyweight   | 500g         | 45%     |

| Code        | Name                    | Weight |
| ----------- | ----------------------- | ------ |
| PARA_500    | Paracetamol_500mg       | 25g    |
| AMOX_250    | Amoxicillin_250mg       | 30g    |
| INSULIN_100 | Insulin_Glargine        | 45g    |
| ORS_20      | Oral_Rehydration_Salts  | 20.5g  |
| ACT_20      | Artemether-Lumefantrine | 15g    |
| IBU_400     | Ibuprofen_400mg         | 22.5g  |
| MET_500     | Metformin_500mg         | 35g    |
| EPI_03      | Adrenaline_Autoinjector | 120g   |

Medication images are placeholder URLs. Image upload is out of scope.

New medications can be added with `POST /medications`. Adding or changing a medication never changes what is already loaded on a drone, because each loaded item keeps a copy of its weight from the moment it was loaded.

Weights are sent and returned in grams (up to 3 decimal places) and stored as whole milligrams, so sums never pick up floating point errors.

## Tests

Tests use the `drone_dispatch_test` database, which Docker Compose creates on first start. Migrations run on it automatically before the tests.

```bash
docker compose up -d db
npm test
npm run test:cov
```

Other checks:

```bash
npm run lint
npm run format:check
npm run typecheck
```

## Response format

Success:

```json
{ "success": true, "data": { "status": "ok" }, "error": null }
```

Error:

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [{ "field": "name", "errors": ["name must be a string"] }],
    "requestId": "3f1c0b9e-..."
  }
}
```

Every response has an `x-request-id` header. Send your own `x-request-id` to trace a request across services.

## Configuration

Settings come from environment variables and are checked at startup. The app will not start if any value is missing or wrong.

| Variable                    | Default       | Description                                                      |
| --------------------------- | ------------- | ---------------------------------------------------------------- |
| `NODE_ENV`                  | `development` | `development`, `test` or `production`                            |
| `PORT`                      | `3000`        | HTTP port                                                        |
| `LOG_LEVEL`                 | `info`        | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent`   |
| `DATABASE_URL`              | required      | PostgreSQL connection string                                     |
| `API_KEY`                   | required      | Key clients send in `x-api-key`, at least 16 characters          |
| `RATE_LIMIT_TTL_MS`         | `60000`       | Rate limit window in milliseconds                                |
| `RATE_LIMIT_MAX`            | `100`         | Requests allowed per client in each window                       |
| `FLEET_CAPACITY`            | `10`          | Most drones the fleet can have                                   |
| `MAX_DRONE_WEIGHT_LIMIT_G`  | `500`         | Highest weight limit a drone can be registered with              |
| `MIN_LOADING_BATTERY_PCT`   | `25`          | Battery needed to load a drone                                   |
| `PAGINATION_DEFAULT_LIMIT`  | `20`          | Page size when none is sent                                      |
| `PAGINATION_MAX_LIMIT`      | `100`         | Largest page size. A bigger `limit` is lowered to this           |
| `DB_LOCK_TIMEOUT_MS`        | `3000`        | How long a request waits for a drone another request is changing |
| `IDEMPOTENCY_KEY_TTL_HOURS` | `24`          | How long a load `Idempotency-Key` is remembered                  |
| `BATTERY_AUDIT_ENABLED`     | `true`        | Turns the battery audit job on or off                            |
| `BATTERY_CHECK_INTERVAL_MS` | `600000`      | How often the battery audit runs                                 |
| `BATTERY_AUDIT_BATCH_SIZE`  | `1000`        | Drones written per insert during an audit run                    |

## Assumptions

Where the requirements left room, these are the choices I made:

- The fleet has at most 10 drones (`FLEET_CAPACITY`). 8 are seeded, so 2 more can be registered.
- Each drone is registered with its own weight limit, up to `MAX_DRONE_WEIGHT_LIMIT_G` (500g). The model is only a category.
- Medications are a catalogue. A load refers to them by `code` and `quantity`.
- Weights are sent in grams with up to 3 decimals and stored as whole milligrams.
- A battery of exactly 25% can load, and a load can fill a drone to exactly its limit.
- A load can be built over several requests while the drone is LOADING. A drone can only become LOADED with something on board.
- Each trip is a delivery. Going back to IDLE closes the delivery. Deliveries and their items are kept as history.
- Talking to real drones is out of scope, so `PATCH /drones/:id/battery` stands in for battery telemetry. If the battery drops below the minimum while a drone is LOADING, it stays LOADING but cannot take more load.
- Medication images are placeholder URLs. All times are UTC.

## Design decisions

| Decision                                       | Why                                                                                                               | Trade-off                                                                                                                               |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| NestJS 11                                      | Stable and well supported by Jest, Prisma and the rest of the stack                                               | NestJS 12 is newer but had just moved to ESM                                                                                            |
| PostgreSQL                                     | Real transactions, row locks and constraints protect the load rules                                               | Needs a database server, run with Docker Compose                                                                                        |
| Prisma                                         | Typed queries, migrations and seeding                                                                             | Row locks, advisory locks and the batched audit insert use raw SQL                                                                      |
| Row lock (`SELECT ... FOR UPDATE`) for loading | Simple to reason about and gives a clear error for each failed rule                                               | Loads on the same drone wait for each other. A conditional update would be faster but can't say which rule failed                       |
| Only 2 rules in the database                   | `loaded_weight_mg <= weight_limit_mg` and one open delivery per drone protect the load even if the code has a bug | Format rules and limits stay in the app, so they can change without a migration                                                         |
| Whole milligrams                               | Integer sums are exact, the same reason money is kept in kobo or cents                                            | Grams are converted at the edge of the API                                                                                              |
| Idempotency key on load only                   | A retried load is the one write that could do damage twice                                                        | Register, battery update, state changes and retire are already safe to retry                                                            |
| Advisory locks                                 | Keep the fleet cap safe under parallel registrations, and let only one app instance run the battery audit         | Two raw SQL calls                                                                                                                       |
| Page and limit pagination                      | Simple and familiar                                                                                               | Slower on very deep pages. Cursor pagination is listed under next steps                                                                 |
| Separate migrate step                          | Migrations run once per start, not in every app instance                                                          | One more service in Docker Compose. The app image still includes the Prisma CLI, because `@prisma/client` lists it as a peer dependency |
| All limits from env                            | Changing a limit is a restart, not a code change                                                                  | Changing them at runtime would need a settings table                                                                                    |
| API key and rate limit                         | How payment-style APIs usually let businesses in                                                                  | One shared key and an in-memory counter, both noted below                                                                               |

Left out on purpose:

- **Redis**: there is nothing to cache, and Postgres already handles the locks and idempotency keys inside the same transaction.
- **A message queue**: every request finishes in one short transaction. A queue would make sense for real drone telemetry.
- **Microservices**: one small domain and one database. The modules can be split later if needed.

## Project structure

```
src/
  common/       errors, response format, pagination, API key guard, weight conversion
  config/       environment checks and logger setup
  database/     Prisma client, seed data and seed script
  modules/
    drones/     register, list, state changes, loading, retiring
    medications/ medication catalogue
    battery/    battery level, history and the audit job
    health/     health check
prisma/         schema and migrations
test/           end-to-end tests against a real database
```

Rules that don't need the database, like the state machine and the load checks, live in `modules/*/domain` as plain functions with unit tests.

## Going to production

- **Secrets**: `API_KEY` and the database credentials should come from a secret manager. The key in `docker-compose.yml` and `.env.example` is only for local use.
- **Migrations**: run them once per release, before the new app version starts. Keep changes backward compatible so the old version keeps working during the rollout.
- **Several instances**: row locks and the battery audit lock already work across instances. The rate limit counter is in memory, so it needs a shared store such as Redis. Behind a load balancer, set Express `trust proxy` so the rate limit sees the real client IP.
- **Health checks**: point the load balancer at `/health`. It returns 503 when the database is down.
- **Logs**: JSON logs with a request ID on every line, ready to ship to Grafana Loki or similar.
- **Battery audit table**: it grows by one row per drone per run. Add a retention period or monthly partitions.
- **Backups**: regular database backups, with a tested restore.

## What I'd do next

- Cursor pagination for large tables, and an `asOf` time so battery history pages stay stable while new rows arrive
- Receive drone telemetry through a queue instead of setting it with `PATCH`
- Medication image upload with pre-signed S3 URLs
- User accounts and roles, so retiring records who did it and a drone can be brought back into service
- One API key per client instead of a shared key
- Swagger schemas for the `{ success, data, error }` response format
- Trim the app image (about 540 MB): the Prisma CLI still comes in as a peer of `@prisma/client`
- Upgrade to ESLint 10
