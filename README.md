# PlateWise API

Cloudflare Worker with a D1-backed offer API. It accepts synthetic mock data and, while `ALLOW_LICENSED_IMPORTS` is `"true"`, real Flipp runs through `POST /v1/ingest/runs`. `GET /v1/offers` publicly returns the real Flipp snapshot; `GET /v1/observations` returns mock rows only. Set the variable to `"false"` to stop accepting Flipp runs. No collection schedule is configured.

## How it fits

The [PlateWise app](https://github.com/alanmanyin-codespace/app-platewise) is the user-facing Expo application. The [flyer collector](https://github.com/alanmanyin-codespace/platewise-flyer-collector) is a separate experimental project. This API is a backend foundation for synthetic offer experiments; the app does not yet consume these endpoints, and the structured run endpoint is not connected to the collector.

```text
Synthetic data → authenticated ingestion → D1 → read endpoints
```

## API overview

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Return Worker process health. This does not check database connectivity. |
| GET | `/v1/offers?location=T2P%201J9` | Return real Flipp snapshot offers, optionally filtered by `market=calgary` or a postal code. Use `limit` (1-100, default 100) and `offset`; follow `nextOffset` until it is `null`. Market data is stored under the market, so use `market=calgary` for Calgary. |
| GET | `/v1/observations?location=T2P%201J9` | Return up to 100 mock historical observations, optionally filtered by postal code or `market=calgary`. |
| POST | `/v1/ingest/offers` | Insert or update synthetic offers in the legacy snapshot. Requires a bearer token. |
| POST | `/v1/ingest/runs` | Record a synthetic collection run, observations, and rejection reasons. Requires a bearer token. |
| GET, POST | `/v1/ingest/recipes` | List imported recipe IDs, or store up to 25 recipes and their ingredients. Requires a bearer token. |

The read endpoints do not require authentication and do not filter expired offers. They are not a production-ready public feed. Ingestion accepts mock data only; responses identify records as samples. API and schema changes in this branch may not be deployed.

## Getting started

### Prerequisites

- Node.js 22 or newer and npm.
- Cloudflare Wrangler (installed as a development dependency).
- A Cloudflare account and access to the configured D1 database only if using the remote binding or deploying.

### Install and test

```sh
npm ci
npm test
```

`npm test` builds the TypeScript project and runs the Node.js test suite. Use `npm run build` for type checking and compilation alone.

### Run locally with a simulated database

Create a gitignored `.dev.vars` file containing `INGEST_TOKEN=<a local-only test token>`. Keep the token private and do not reuse production credentials. Apply migrations to a local D1 simulation, then start the Worker in local mode:

```sh
npx wrangler d1 migrations apply DB --local
npx wrangler dev --local
```

Use the local address printed by Wrangler to check `GET /health` or request `/v1/offers?location=T2P%201J9`. For a fresh local database, specify the same new `--persist-to` directory on both commands.

**Remote binding:** `npm run dev` uses the repository's D1 binding, which has `remote: true`; the Worker runs locally but queries and writes the configured remote development database. Use `--local` as shown above to avoid changing remote data. Remote mode requires the appropriate Cloudflare authentication and database permissions.

## Data structure

The existing `offers` table is the current v1 snapshot, keyed by provider, source ID and normalized postal code. The additive second migration reserves nullable structured price and source fields. It also creates `collection_runs` for run status and counts, `offer_observations` for one source-offer snapshot per run, and `collection_rejections` for reason codes without retaining rejected payloads. Monetary fields in the new structure use integer cents; nullable fields represent unknown values. The old `price` column remains for the current API, and existing values are not converted automatically.

The existing mock uploader still uses the original endpoint. The new endpoint below writes run and observation records but does **not** update the legacy `offers` snapshot; `/v1/observations` exposes its latest 100 historical observations, optionally filtered by `location`. No real-source authorization is implied by this schema.

## Structured run ingestion (version 1)

`POST /v1/ingest/runs` requires the same bearer secret and accepts the versioned synthetic contract illustrated below. All offers must belong to the run's postal code. IDs and text are limited to 200 characters; each request allows at most 100 offers and 100 rejection reasons and 100,000 bytes. Dates are `YYYY-MM-DD` or `null`; timestamps are UTC ISO 8601 with `Z`. This initial contract requires CAD integer cents and explicitly labeled mock data. It supports completed, partial, and failed runs only. A future version can add richer price types and authorized sources.

```json
{"schemaVersion":1,"run":{"id":"run-001","source":"mock","searchPostalCode":"T2P1J9","startedAt":"2026-11-01T12:00:00Z","finishedAt":"2026-11-01T12:00:04Z","status":"completed","isSample":true},"offers":[{"sourceOfferId":"sample-milk","retailer":{"sourceRetailerId":"example-store","displayName":"Example Store"},"productName":"Milk","price":{"amountCents":499,"currency":"CAD","text":"$4.99 each","purchaseQuantity":1,"purchaseUnit":"item"},"validFrom":"2026-11-01","validUntil":"2026-11-07","observedAt":"2026-11-01T12:00:02Z","isSample":true}],"rejections":[]}
```

A run may add `run.market`, a lowercase slug such as `calgary`, and each offer may add `seenIn`, a list of 1-20 postal codes. Market runs store the slug as `location` and the postal codes in `offer_observations.seen_postal_codes`; `searchPostalCode` is still required.

Each rejection is `{ "recordReference": "row-7", "reasonCode": "INVALID_DATE" }`. Counts are derived from accepted offers and unique rejected record references; they are not a claim about all source records. The API commits each run atomically. Retrying the **exact same request bytes** with the same run ID returns 200; reuse of a run ID with different bytes returns 409. New runs return 201. Persist and retry the original bytes rather than rebuilding the JSON. Run and observation retention and the collector integration are not implemented.

If a local simulation was created with an earlier development version of a migration, use a fresh `--persist-to` directory and apply both migrations there. Do not edit applied migrations in a shared environment without a migration plan.

## Deployment and data access

The checked-in configuration targets a development Worker and D1 database. Before any remote migration, deployment, or secret update, verify the Cloudflare account, Worker, database binding, and applied migration history. Keep `INGEST_TOKEN` in a server-side secret store and coordinate it securely with authorized uploaders; never expose it to client code or commit it.

This repository does not establish the current deployment or remote migration state. Verify those separately before making remote changes. Real data requires an authorized source, a reviewed ingestion contract, and provider-specific permissions. Do not automate collection or publish data from the unofficial Flipp adapter without authorization. Review access controls, abuse protection, data retention, and monitoring before production use.

## Project layout

- `src/index.ts` — Worker routing and HTTP handlers.
- `src/validation.ts` — legacy mock-offer validation.
- `src/runs.ts` — structured run validation and persistence.
- `migrations/` — D1 schema migrations.
- `test/` — API and run-ingestion tests.
