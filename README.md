# Drone Dispatch Service

REST API for managing a fleet of drones that deliver medication.

Built with Node.js, TypeScript, NestJS, PostgreSQL and Prisma.

## Requirements

- Docker with Docker Compose
- Node.js 24 (only for running without Docker)

## Quick start

```bash
docker compose up --build
```

On start, a one-off `migrate` service applies database migrations and loads the seed data, then exits. The API starts only after it finishes successfully.

- API: `http://localhost:3000/api/v1`
- Docs (Swagger): `http://localhost:3000/docs`
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

| Brief asks for                           | Endpoint                                                    |
| ---------------------------------------- | ----------------------------------------------------------- |
| Register a drone                         | `POST /drones`                                              |
| Check available drones for loading       | `GET /drones?available=true`                                |
| Load a drone with medication             | `POST /drones/:id/load`                                     |
| Check loaded medication for a drone      | `GET /drones/:id/medications`                               |
| Check battery level for a drone          | `GET /drones/:id/battery`                                   |
| Periodic battery check with an audit log | Background job, read with `GET /drones/:id/battery/history` |

| Method | Path                          | What it does                                                                      |
| ------ | ----------------------------- | --------------------------------------------------------------------------------- |
| POST   | `/drones`                     | Register a drone. It starts IDLE and empty                                        |
| GET    | `/drones`                     | List drones. Filters: `available`, `state`, `page`, `limit`                       |
| GET    | `/drones/:id`                 | Get one drone                                                                     |
| POST   | `/drones/:id/transitions`     | Move a drone to its next state, e.g. `{ "to": "LOADED" }`                         |
| POST   | `/drones/:id/load`            | Load medications, e.g. `{ "items": [{ "code": "PARA_500", "quantity": 2 }] }`     |
| GET    | `/drones/:id/medications`     | Medications on the drone's current delivery                                       |
| GET    | `/medications`                | Medication catalogue. Filters: `page`, `limit`                                    |
| GET    | `/drones/:id/battery`         | Battery level and whether it is too low to load                                   |
| PATCH  | `/drones/:id/battery`         | Set the battery level, e.g. `{ "batteryPct": 40 }`. Stands in for drone telemetry |
| GET    | `/drones/:id/battery/history` | Battery audit log, newest first. Filters: `page`, `limit`                         |

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

Error codes: `VALIDATION_ERROR`, `DRONE_NOT_FOUND`, `MEDICATION_NOT_FOUND`, `DUPLICATE_SERIAL`, `FLEET_FULL`, `INVALID_STATE_TRANSITION`, `DRONE_NOT_LOADABLE`, `BATTERY_TOO_LOW`, `DRONE_OVERWEIGHT`, `IDEMPOTENCY_KEY_REUSED`, `DRONE_BUSY` (another request is changing the same drone; try again).

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
| `BATTERY_CHECK_INTERVAL_MS` | `60000`       | How often the battery audit runs                                 |
| `BATTERY_AUDIT_BATCH_SIZE`  | `1000`        | Drones written per insert during an audit run                    |

## Notes

- Migrations run once as their own step, not in every app instance, so the app image does not need the Prisma CLI.
- The rate limit is counted in memory, so each app instance has its own count. Running several instances would need a shared store such as Redis.
- Behind a load balancer, Express `trust proxy` must be set so the rate limit uses the real client IP.
