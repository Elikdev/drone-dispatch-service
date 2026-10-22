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
npm run start:dev
```

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

| Variable            | Default       | Description                                                    |
| ------------------- | ------------- | -------------------------------------------------------------- |
| `NODE_ENV`          | `development` | `development`, `test` or `production`                          |
| `PORT`              | `3000`        | HTTP port                                                      |
| `LOG_LEVEL`         | `info`        | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent` |
| `DATABASE_URL`      | required      | PostgreSQL connection string                                   |
| `API_KEY`           | required      | Key clients send in `x-api-key`, at least 16 characters        |
| `RATE_LIMIT_TTL_MS` | `60000`       | Rate limit window in milliseconds                              |
| `RATE_LIMIT_MAX`    | `100`         | Requests allowed per client in each window                     |

## Notes

- The rate limit is counted in memory, so each app instance has its own count. Running several instances would need a shared store such as Redis.
- Behind a load balancer, Express `trust proxy` must be set so the rate limit uses the real client IP.
