# PGNC Solr Client Service

NestJS 11 service that fronts Apache Solr for the PGNC External Stack. It exposes a lightweight REST API (`/browse`) that the Angular frontend and Nginx proxy consume, adding request validation, response shaping, and credential management on top of raw Solr endpoints.

## Repository Layout

- `Dockerfile` – builds the production image on `node:20-alpine`, compiles the NestJS app, and boots it via `npm run start:prod`
- `src/`
	- `app.module.ts` – wires configuration, validation, and the browse module
	- `browse/` – controller, service, and module for search queries
	- `config/` – environment schema (`environment.validation.ts`) plus config factories for app and Solr settings
	- `models/` – response DTOs and helper classes used to normalise Solr output
- `test/` – Jest e2e scaffolding
- `package.json` – scripts for development (`start:dev`), testing, linting, and building

Environment variables are pulled from the repository root `.env` file during Compose builds and when running `npm start` locally.

## Runtime Expectations

The service is deployed via the `solr-client` entry within `docker-compose.yml`:

- Listens on port `SOLR_CLIENT_PORT` (default 3000) inside the Compose network; optionally exposed to localhost through `LOCALHOST_SOLR_CLIENT_PORT`
- Depends on the `python` data loader and the `solr` core being healthy before starting
- Authenticates to Solr using `SOLR_USERNAME`/`SOLR_PASSWORD` supplied in `.env`
- Health-check endpoint (see Compose file) verifies the service can proxy a sample query to Solr

## Configuration

Required environment variables (validated at boot time):

| Variable | Description |
| -------- | ----------- |
| `SOLR_HOST` | Hostname of the Solr container (typically `solr`) |
| `SOLR_PORT` | Internal Solr port (default `8983`) |
| `SOLR_CORE` | Name of the core to query (`pgnc`) |
| `SOLR_USERNAME` | Basic auth user with read access |
| `SOLR_PASSWORD` | Basic auth password |

Optional: `NODE_ENV` (`dev`, `prod`, `test`, `stage`) – defaults to `dev` for local runs.

When running outside Compose, create a `.env` file in the project root referencing these values or export them in the shell before starting the service.

## API Surface

`GET /browse`

Query parameters:

- `q` – search string (e.g. `ABC*`)
- `start` – 1-based row offset
- `rows` – number of documents to return
- `filters` – optional repeated parameter mapping directly to Solr filter queries (`fq`)

Response structure mirrors `SearchResult` and `Gene` models with curated highlights and metadata for the frontend. The service sanitises and transforms Solr’s JSON to ensure consistent contracts.

Example request:

```bash
curl "http://localhost:${LOCALHOST_SOLR_CLIENT_PORT:-3000}/browse" \
	--get --data-urlencode "q=ABC" --data "rows=10" --data "start=1" \
	--data-urlencode "filters=status:Approved"
```

## Local Development

```bash
cd solr-client

# Install dependencies
npm install

# Ensure ../.env is populated, then start in watch mode
npm run start:dev

# Run unit tests
npm test

# Lint / format
npm run lint
npm run format
```

During development the service expects a reachable Solr instance. You can run `docker compose up solr solr-client` from the repository root to spin up Solr alongside the client, or point the environment variables at an existing stack.

## Production Build

```bash
# Rebuild container after code/config changes
docker compose build solr-client

# Launch via Compose with dependencies
docker compose up -d solr-client

# Tail logs
docker compose logs -f solr-client
```

The Docker image executes `npm run start:prod`, which serves the compiled TypeScript output from `dist/`.

## Troubleshooting

- **400 responses** – the validation layer rejected missing/invalid query parameters; confirm `q`, `start`, and `rows` are provided.
- **502 from Nginx** – ensure `solr` is healthy and credentials are correct; the client simply proxies Solr failures.
- **Config validation errors** – check the environment variables listed above; all are mandatory at startup.
- **Highlight issues** – review `BrowseController.transformSolrGene`; adjust mappings if new fields are introduced in Solr responses.

## Integration Notes

- The Angular SSR frontend and external Nginx proxy call this service instead of hitting Solr directly, enabling shared authentication and response shaping.
- Keep `SOLR_*` credentials consistent with the `solr` service; update `.env` once and rebuild both images when rotating secrets.
- For feature additions (faceting, new endpoints), extend the `BrowseModule` or add new Nest modules while reusing the existing configuration scaffolding.

## License

This component inherits the repository’s AGPL-3.0 license; see the root `LICENSE` file for terms.
