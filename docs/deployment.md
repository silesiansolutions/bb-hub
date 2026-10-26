# Deployment runbook

The deployment is code: `deploy/ansible/site.yml` sets up the server, `deploy/compose.yaml` runs the API and Redis there, `apps/edge` is the Cloudflare Worker that serves the site and forwards `/api`, and `.github/workflows/deploy.yml` runs both. The steps below are the ones the code cannot do: accounts, credentials, DNS and repository settings. Do them once, in order.

## 1. MongoDB Atlas

1. Create a free M0 cluster in a European region.
2. Create a database user with `readWrite` on the database `bb` only.
3. Under Network Access, allow the server's outbound addresses. On the server, `curl -s -k -6 https://info.mikr.us` prints them as `info_ipv4` and `info_ipv6`. The IPv4 address is shared by other Mikrus servers, so the database user's password is what protects the cluster; make it long and random.
4. Copy the connection string, with `/bb` as the database, into the secret `MONGODB_URI`.
5. Load the history from a machine with a checkout of `silesiansolutions/bb-data`:

   ```bash
   pnpm --filter @bb-hub/api build
   MONGODB_URI='<the connection string>' node apps/api/dist/backfill/backfill.js --dir ../bb-data/data --dir ../bb-data/backup-data
   ```

## 2. Cloudflare R2

1. Create a private bucket, for example `bb-data`, and put its name in `R2_BUCKET`.
2. Create an R2 API token with Object Read & Write limited to that bucket. Its access key goes to `R2_ACCESS_KEY_ID` and its secret to `R2_SECRET_ACCESS_KEY`.
3. Put the S3 endpoint `https://<account id>.r2.cloudflarestorage.com` in `R2_ENDPOINT`.

## 3. Write access to bb-data

1. `ssh-keygen -t ed25519 -N '' -C bb-hub-collector -f bb-data-deploy`
2. In `silesiansolutions/bb-data`, Settings, Deploy keys: add `bb-data-deploy.pub` with write access.
3. Put the private key `bb-data-deploy` in the secret `BB_DATA_DEPLOY_KEY`, then delete both local files.

The daily commits are authored as `rylkobot` (set in the playbook); the deploy key only authorises the push.

## 4. Server access for GitHub Actions

1. `ssh-keygen -t ed25519 -N '' -C bb-hub-deploy -f bb-hub-deploy`
2. Append `bb-hub-deploy.pub` to `/root/.ssh/authorized_keys` on the server.
3. Put the private key in `DEPLOY_SSH_KEY`, the server's `<name>.mikrus.xyz` in `DEPLOY_HOST`, its SSH port (10000 + ID) in `DEPLOY_PORT`, and the output of `ssh-keyscan -p <port> <host>` in `DEPLOY_KNOWN_HOSTS`. Delete the local key files.
4. Put the first service port (20000 + ID) in `API_PORT`.

## 5. Origin and Worker

1. `openssl rand -hex 32` goes to `ORIGIN_SECRET`; the Worker sends it, the API refuses requests without it.
2. `https://<name>-<API_PORT>.mikrus.cloud` goes to `ORIGIN_URL`. The Worker reads it as a secret, so the origin address never appears in the repository.
3. Create a Cloudflare API token with Workers Scripts Edit (account), and Zone Read plus Workers Routes Edit (zone `silesiansolutions.com`). Put it in `CLOUDFLARE_API_TOKEN` and the account id in `CLOUDFLARE_ACCOUNT_ID`.
4. DNS: in the zone `silesiansolutions.com`, add a proxied `AAAA` record `bb` pointing to `100::`. The Worker route `bb.silesiansolutions.com/*` answers on it; the address is never contacted.

## 6. Repository secrets

In `silesiansolutions/bb-hub`, Settings, Secrets and variables, Actions, add every secret named above:

| Secret | From step |
| --- | --- |
| `MONGODB_URI` | 1 |
| `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | 2 |
| `BB_DATA_DEPLOY_KEY` | 3 |
| `DEPLOY_SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_PORT`, `DEPLOY_KNOWN_HOSTS`, `API_PORT` | 4 |
| `ORIGIN_SECRET`, `ORIGIN_URL`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | 5 |

## 7. Image

The `image` workflow pushes `ghcr.io/silesiansolutions/bb-hub-api:sha-<commit>` and `:latest` on every master change to the API, and can be started by hand. Run it once before the first deployment, then open the package `bb-hub-api` under the organisation's packages and set its visibility to public, so the server pulls it without credentials. The `sha-<commit>` tag of that run is the `api_tag` to deploy.

## Running a deployment

Actions, `deploy`, Run workflow, on `master` only, with `api_tag` set to `sha-<full commit sha>` of an image the `image` workflow built.

- `check` runs `ansible-playbook --check --diff` against the server and `wrangler deploy --dry-run`. It changes nothing on the server and hides the secret files and the server logbook from the diff. It cannot prove that Docker runs on the server, because Docker is not installed yet: the first `apply` is that test.
- `apply` installs Docker and the compose plugin, runs a memory-limited probe container with a published port, writes the files under `/root/MCPAPPS/bb-hub`, starts the stack with the given image, waits for `/api/health` on IPv4 and IPv6, deploys the Worker with its secrets, then checks the site, `/api/health` and `/api/parkings` through Cloudflare.
- If the probe container fails, the run stops before the stack is touched; there is no fallback runtime. Docker stays installed and can be removed with `apt purge docker.io docker-compose-v2`.
- The workflow refuses to run without the secrets or with a tag that is not a full commit sha.
- Rollback: run `apply` again from the commit to return to, with that commit's `api_tag`, so the API and the site match. For the Worker alone, `wrangler rollback` from `apps/edge` with `CLOUDFLARE_API_TOKEN` set locally.

## After go-live

- `/api/health` lists the last success per source; parking and air should move every 5 minutes, discovery and export once a day.
- The tail of the old `bb-node` collector is imported by `bb-data` (`scripts/import-tail.sh`), after which `bb-node` can be archived.
