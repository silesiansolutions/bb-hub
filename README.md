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

A reading is counted once. An upsert matches only when the reading is newer than the last one counted for that hour (per metric for air); a repeated reading ends in a duplicate key error that is ignored. Re-running an import over the same files is therefore safe, but readings are expected in time order: a reading older than the last one counted for its hour is skipped, so a later run with an extra tree adds only readings newer than what each hour already holds. The import logs how many readings it read, counted and skipped.

Measured on 2026-10-25 over the full history from 2024-02-25: about 155 MB of data and indexes (456k documents) against the 512 MB of a MongoDB Atlas free cluster. Each source adds at most 8,760 hourly documents a year. At the averages measured with `$collStats` on that date (86 B per parking document, 379 B per air document, about 14 B of index per document), that is about 0.9 MB a year per car park and 3.4 MB a year per reporting air sensor. Daily views are computed from the hourly documents in the `Europe/Warsaw` time zone. A range is rounded out to whole hours (hourly views) or whole Warsaw days (daily views), so the first and last points always cover a full period; the current hour and day are naturally partial.

## API

All routes sit under `/api`; interactive documentation at `/api/docs`.

| Route | Returns |
| --- | --- |
| `GET /api/parkings`, `GET /api/parkings/:id` | car parks with the latest reading |
| `GET /api/parkings/:id/hourly?from&to` | free spaces per hour, up to 31 days (checked before rounding out to whole hours), last 24 hours by default |
| `GET /api/parkings/:id/daily?from&to` | free spaces per day, up to 400 days (checked before rounding out to whole days), last 30 days by default |
| `GET /api/air`, `/api/air/:id`, `/hourly`, `/daily` | the same for air sensors, per metric |
| `GET /api/stats/coverage?from&to` | hours with data per source and their share of the range up to the current hour |
| `GET /api/stats/air/daily?from&to` | city-wide daily average (weighted by the number of measurements), minimum and maximum per metric across sensors |
| `GET /api/health` | MongoDB and Redis status |

When `ORIGIN_SECRET` is set, every API route except `/api/health` requires the `x-origin-secret` header, so only the edge proxy reaches the data. The documentation under `/api/docs` stays public. Successful responses carry `Cache-Control: public` (5 minutes, statistics 1 hour); errors are never cached.

## Development

Node 24 (`.nvmrc`) and pnpm 11 (`packageManager`).

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
docker compose --profile local-db up -d redis mongo
pnpm --filter @bb-hub/api start:dev
```

Tests: `pnpm --filter @bb-hub/api test` for unit tests, `pnpm --filter @bb-hub/api test:e2e` with `MONGODB_URI` and `REDIS_URL` set; the e2e suite drops its database and refuses to run unless the database name ends with `_e2e`.

The site: `pnpm --filter @bb-hub/web build` writes a static export to `apps/web/out`. It calls the API at `/api` on its own origin, as it does behind the edge proxy, so serve `out` and the API under one origin to try it locally. `pnpm --filter @bb-hub/web test` runs the unit tests.

Importing a raw history in the `<type>/<id>/<YYYY-MM-DD>.json` layout; several trees are merged by reading time:

```bash
pnpm --filter @bb-hub/api build
MONGODB_URI=... node apps/api/dist/backfill/backfill.js --dir <data> --dir <backup-data>
```

Air readings from devices that report a town other than Bielsko-Biała are skipped; `--any-city` keeps them.

## License

[MIT](./LICENSE).
