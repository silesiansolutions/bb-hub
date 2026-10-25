# bb-hub

[![CI](https://github.com/silesiansolutions/bb-hub/actions/workflows/ci.yml/badge.svg)](https://github.com/silesiansolutions/bb-hub/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Free spaces in the car parks of Miejski Zarząd Dróg and air quality in Bielsko-Biała, for residents who want the current state and the history in one place. A monorepo with an API in NestJS that serves hourly aggregates from MongoDB and a static Polish and English site in Next.js.

- [Site](https://bb.silesiansolutions.com)
- [Data repository](https://github.com/silesiansolutions/bb-data) (private)

## Architecture

| Path | What it is |
| --- | --- |
| `apps/api` | NestJS 12 API on Node 24: read-only endpoints over hourly aggregates in MongoDB |
| `apps/web` | Next.js 16 static export: dashboard, car parks, air sensors, statistics |
| `compose.yaml` | API and Redis with hard memory limits; `--profile local-db` adds a local MongoDB |
| `.github/workflows/ci.yml` | lint, typecheck, unit and e2e tests against MongoDB and Redis, builds |

MongoDB keeps hourly aggregates, not raw readings; the raw history lives outside the database. One document per source and UTC hour, keyed by a compound `_id`, so the `_id` index is the only index:

- `parking_hourly`: `{ _id: { p, h }, n, s, lo, hi, cap, last }`: count, sum, minimum and maximum of free spaces in the hour, capacity, and the time of the last reading counted.
- `air_hourly`: `{ _id: { s, h }, m: { <metric>: { n, s, lo, hi, t } } }`: the same counters per metric, each bucketed by the measurement time its sensor reports; `t` is the last measurement counted.
- `latest`: the newest value per source and metric.

A reading is counted once. An upsert matches only when the reading is newer than the last one counted for that hour (per metric for air); a repeated reading ends in a duplicate key error that is ignored. Re-running an import over the same files is therefore safe, but readings are expected in time order: a reading older than the last one counted for its hour is skipped, so a later run with an extra tree adds only readings newer than what each hour already holds. Air readings from devices that report a town other than Bielsko-Biała are skipped, and a sample without `read_at`, or with `read_at` more than 5 minutes after the fetch, is skipped too; the import logs every counter.

Measured on 2026-10-25 over the full history (car parks from 2024-01-07, air from 2024-01-24, both to 2026-10-25): 171 MB of data and indexes (474k documents; 60 MB on disk after compression, indexes included) against the 512 MB of a MongoDB Atlas free cluster. Each source adds at most one hourly document per hour, 8,760 in a common year. At the averages measured with `$collStats` on that date (86 B per parking document, 382 B per air document, about 15 B of index per document), that is about 0.9 MB a year per car park and 3.5 MB a year per reporting air sensor.

All API routes sit under `/api`; interactive documentation at `/api/docs`. Daily views are computed in the `Europe/Warsaw` time zone. A range is rounded out to whole hours or whole Warsaw days, so the first and last points cover a full period; the current hour and day are naturally partial.

| Route | Returns |
| --- | --- |
| `GET /api/parkings`, `GET /api/parkings/:id` | car parks with the latest reading |
| `GET /api/parkings/:id/hourly?from&to` | free spaces per hour, up to 31 days (checked before rounding), last 24 hours by default |
| `GET /api/parkings/:id/daily?from&to` | free spaces per day, up to 400 days (checked before rounding), last 30 days by default |
| `GET /api/air`, `/api/air/:id`, `/hourly`, `/daily` | the same for air sensors, per metric |
| `GET /api/stats/coverage?from&to` | hours with data per source and their share of the range up to the current hour |
| `GET /api/stats/air/daily?from&to` | city-wide daily average (weighted by the number of measurements), minimum and maximum per metric across sensors |
| `GET /api/health` | MongoDB and Redis status |

## Configuration

| Variable | Meaning |
| --- | --- |
| `PORT` | HTTP port, 3001 by default |
| `MONGODB_URI` | MongoDB connection string |
| `REDIS_URL` | Redis connection string |
| `NODE_ENV` | `production`, `development` or `test`; `production` in the image, set it yourself when running `dist/main.js` outside the image |
| `ORIGIN_SECRET` | value of the `x-origin-secret` header the edge proxy sends; required in production |
| `ORIGIN_SECRET_DISABLED` | `true` lets production start without `ORIGIN_SECRET` |
| `CORS_ORIGIN` | origin of a local site during development; refused in production |
| `NEXT_PUBLIC_API_URL` | site only, at build time: API base, `/api` by default |

With `ORIGIN_SECRET` set, every API route except `/api/health` and the documentation (`/api/docs`, `/api/docs-json`) requires the header, so only the edge proxy reaches the data. The rate limit is 120 requests a minute per client, keyed on `CF-Connecting-IP`, falling back to the socket address; `X-Forwarded-For` is ignored. Statistics routes allow 10 requests a minute per client, compute one uncached result at a time with at most four waiting (beyond that they answer 503), and keep up to 24 results in memory for an hour. Successful responses carry `Cache-Control: public` (5 minutes, statistics 1 hour); errors are never cached.

## Deployment

The API runs as the container built from `apps/api/Dockerfile`, next to Redis, with the memory limits from `compose.yaml`, behind Cloudflare. The site is the static export in `apps/web/out`, served from Cloudflare at bb.silesiansolutions.com, which forwards `/api` to the API. Deployment as code and its runbook arrive with the deployment change.

## Data sources

- Car park occupancy: counters of the car parks run by Miejski Zarząd Dróg w Bielsku-Białej, read from the Controlla widget that MZD links from its car park pages.
- Air quality: the public device API of Syngeos.

Data are shown as collected, without warranty.

## Development

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
docker compose --profile local-db up -d redis mongo
pnpm --filter @bb-hub/api start:dev
NEXT_PUBLIC_API_URL=http://localhost:3001/api pnpm --filter @bb-hub/web dev
pnpm --filter @bb-hub/web build
pnpm -r lint && pnpm -r typecheck && pnpm -r test
MONGODB_URI=mongodb://localhost:27017/bb_e2e REDIS_URL=redis://localhost:6379 pnpm --filter @bb-hub/api test:e2e
pnpm --filter @bb-hub/api build && MONGODB_URI=... node apps/api/dist/backfill/backfill.js --dir <data> --dir <backup-data>
```

Node 24 (`.nvmrc`) and pnpm 11 (`packageManager`). The site build writes a static export to `apps/web/out`. The e2e suite drops its database and refuses to run unless the name ends with `_e2e`. The last command imports raw `<type>/<id>/<YYYY-MM-DD>.json` trees, merged by reading time; `--any-city` keeps air readings from other towns.

## Contributing

Commits and pull request titles follow [Conventional Commits](https://www.conventionalcommits.org) (`feat:`, `fix:`, `docs:`, ...). Pull requests use the [repository template](.github/pull_request_template.md).

Contribution and security policies are shared across the organization and live in [`silesiansolutions/.github`](https://github.com/silesiansolutions/.github). Report vulnerabilities privately through the process described there rather than in a public issue.

## License

This project is licensed under the MIT License. See the [LICENSE](./LICENSE) file for details.

## Author

Developed and maintained by [Dawid Ryłko](https://dawidrylko.com) at [Silesian Solutions](https://silesiansolutions.com/).
