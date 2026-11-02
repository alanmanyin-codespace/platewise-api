# PlateWise API

Cloudflare Worker with a D1-backed offer API. This initial version accepts **synthetic mock offers only**; it is not a pipeline for real flyers. `ALLOW_LICENSED_IMPORTS` remains false and changing it does not enable any real provider. No collection schedule is configured.

## Data structure

The existing `offers` table is the current v1 snapshot, keyed by provider, source ID and normalized postal code. The additive second migration reserves nullable structured price and source fields. It also creates `collection_runs` for run status and counts, `offer_observations` for one source-offer snapshot per run, and `collection_rejections` for reason codes without retaining rejected payloads. Monetary fields in the new structure use integer cents; nullable fields represent unknown values. The old `price` column remains for the current API, and existing values are not converted automatically.

The existing mock uploader still uses the original endpoint. The new endpoint below writes run and observation records but does **not** update the legacy `offers` snapshot; `/v1/observations` exposes its latest 100 historical observations, optionally filtered by `location`. No real-source authorization is implied by this schema.

## Structured run ingestion (version 1)

`POST /v1/ingest/runs` requires the same bearer secret and accepts the versioned synthetic contract illustrated below. All offers must belong to the run's postal code. IDs and text are limited to 200 characters; each request allows at most 100 offers and 100 rejection reasons and 100,000 bytes. Dates are `YYYY-MM-DD` or `null`; timestamps are UTC ISO 8601 with `Z`. This initial contract requires CAD integer cents and explicitly labeled mock data. It supports completed, partial, and failed runs only. A future version can add richer price types and authorized sources.

```json
{"schemaVersion":1,"run":{"id":"run-001","source":"mock","searchPostalCode":"T2P1J9","startedAt":"2026-11-01T12:00:00Z","finishedAt":"2026-11-01T12:00:04Z","status":"completed","isSample":true},"offers":[{"sourceOfferId":"sample-milk","retailer":{"sourceRetailerId":"example-store","displayName":"Example Store"},"productName":"Milk","price":{"amountCents":499,"currency":"CAD","text":"$4.99 each","purchaseQuantity":1,"purchaseUnit":"item"},"validFrom":"2026-11-01","validUntil":"2026-11-07","observedAt":"2026-11-01T12:00:02Z","isSample":true}],"rejections":[]}
```

Each rejection is `{ "recordReference": "row-7", "reasonCode": "INVALID_DATE" }`. Counts are derived from accepted offers and unique rejected record references; they are not a claim about all source records. The API commits each run atomically. Retrying the **exact same request bytes** with the same run ID returns 200; reuse of a run ID with different bytes returns 409. New runs return 201. Persist and retry the original bytes rather than rebuilding the JSON. Run and observation retention and the collector integration are not implemented.

Both migrations have been applied to the development database. The second one changed during development, so a local simulation persisted from an earlier test may hold the older shape; for a fresh local test, use a new `--persist-to` directory for both `wrangler d1 migrations apply DB --local` and `wrangler dev`.

## Local development

Use Node 22 or newer. Run `npm ci` and `npm test`. Create a gitignored `.dev.vars` file containing `INGEST_TOKEN=<a local-only test token>`, then run `npm run dev`.

The `DB` binding sets `"remote": true`, so `npm run dev` runs the Worker on your machine while every query goes to the real `platewise-dev` database; mock data written during development is stored there. This needs `npx wrangler login` first. To work against a local simulation instead, run `npx wrangler dev --local` after `npx wrangler d1 migrations apply DB --local`. Never commit or share tokens. `GET /health` reports process health, and `GET /v1/offers?location=T2P%201J9` returns at most 100 offers. `POST /v1/ingest/offers` requires an `Authorization: Bearer` token and an `{ "offers": [...] }` payload from the collector's mock uploader. Mock offers are marked `sample: true` in responses. Uploads are upserted by provider, ID, and postal code.

## Development deployment (approval required)

The configuration names Worker `platewise-api-dev` and database `platewise-dev` (`7a434f30-dc15-4482-82e3-18ed1d60d653`), created for development only. The separate `platewise-db` (`f7aa3b1e-764f-46ce-86ff-470d7b9c852d`) is **not** bound here and carries no schema; do not point this configuration at it without review.

Both migrations have been applied to `platewise-dev` and the binding is verified working from a local `wrangler dev` session. Before any further remote change, confirm you are authenticated to the intended account and that the database identity matches. The Worker itself has **not** been deployed. After explicit approval, from this directory run:

```sh
npx wrangler d1 migrations list DB --remote
npx wrangler d1 migrations apply DB --remote
npx wrangler deploy
```

Set the secret interactively using `npx wrangler secret put INGEST_TOKEN --name platewise-api-dev`; enter the value at the hidden prompt. Coordinate the same secret securely with the collector's execution environment, never frontend code. Secret setup and deployment may need the Worker to exist first. The exact deployed URL is not known until deployment. Deployment and remote secret setup have not been performed; remote migrations and the live binding have.

Real data requires an authorized source, a reviewed ingestion contract and provider-specific permissions. Do not use the unofficial Flipp adapter for automated collection or publication without authorization. Review access controls, request size limits, abuse protection, data retention and operational monitoring before public production use.
