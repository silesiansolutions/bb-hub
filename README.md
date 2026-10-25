# bb-hub

Parking occupancy of the MZD car parks and air quality in Bielsko-Biała, published at bb.silesiansolutions.com. Monorepo: an API in NestJS and a static site in Next.js.

## Layout

| Path | What it is |
| --- | --- |
| `apps/api` | NestJS 12 API on Node 24: read-only endpoints over hourly aggregates in MongoDB |
| `apps/web` | Next.js 16 static export with a Polish and English interface |
| `compose.yaml` | API and Redis with hard memory limits; `--profile local-db` adds a local MongoDB |
| `.github/workflows/ci.yml` | lint, typecheck, unit and e2e tests against MongoDB and Redis, builds |

## Data model

MongoDB keeps hourly aggregates, not raw readings; the raw history lives outside the database. One document per source and UTC hour, keyed by a compound `_id`, so the `_id` index is the only index:

- `parking_hourly`: `{ _id: { p, h }, n, s, lo, hi, cap, last }`: count, sum, minimum and maximum of free spaces in the hour, capacity, and the time of the last reading counted.
- `air_hourly`: `{ _id: { s, h }, m: { <metric>: { n, s, lo, hi, t } } }`: the same counters per metric, each bucketed by the measurement time its sensor reports; `t` is the last measurement counted.
- `latest`: the newest value per source and metric.

A reading is counted once. An upsert matches only when the reading is newer than the last one counted for that hour; a repeated old reading ends in a duplicate key error that is ignored, so re-running an import is safe.

Measured on the full history from 2024-02-25: about 155 MB of data and indexes (456k documents) against the 512 MB of a MongoDB Atlas free cluster. Daily views are computed from the hourly documents in the `Europe/Warsaw` time zone.

## API

All routes sit under `/api`; interactive documentation at `/api/docs`.

| Route | Returns |
| --- | --- |
| `GET /api/parkings`, `GET /api/parkings/:id` | car parks with the latest reading |
| `GET /api/parkings/:id/hourly?from&to` | free spaces per hour, up to 31 days, last 24 hours by default |
| `GET /api/parkings/:id/daily?from&to` | free spaces per day, up to 400 days, last 30 days by default |
| `GET /api/air`, `/api/air/:id`, `/hourly`, `/daily` | the same for air sensors, per metric |
| `GET /api/stats/coverage?from&to` | hours with data per source and their share of the range |
| `GET /api/stats/air/daily?from&to` | city-wide daily average, minimum and maximum per metric across sensors |
| `GET /api/health` | MongoDB and Redis status |

When `ORIGIN_SECRET` is set, every route except `/api/health` requires the `x-origin-secret` header, so only the edge proxy reaches the origin.

## Development

Node 24 (`.nvmrc`) and pnpm 11 (`packageManager`).

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
docker compose --profile local-db up -d redis mongo
pnpm --filter @bb-hub/api start:dev
```

Tests: `pnpm --filter @bb-hub/api test` for unit tests, `pnpm --filter @bb-hub/api test:e2e` with `MONGODB_URI` and `REDIS_URL` pointing at a disposable database.

Importing a raw history in the `<type>/<id>/<YYYY-MM-DD>.json` layout; several trees are merged by reading time:

```bash
pnpm --filter @bb-hub/api build
MONGODB_URI=... node apps/api/dist/backfill/backfill.js --dir <data> --dir <backup-data>
```

Air readings from devices that report a town other than Bielsko-Biała are skipped; `--any-city` keeps them.

## License

[MIT](./LICENSE).
