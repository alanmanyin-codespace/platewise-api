# PlateWise API

Cloudflare Worker with a D1-backed offer API. This initial version accepts **synthetic mock offers only**; it is not a pipeline for real flyers. `ALLOW_LICENSED_IMPORTS` remains false and changing it does not enable any real provider. No collection schedule is configured.

## Local development

Use Node 22 or newer. Run `npm ci`, `npm test`, and `npx wrangler d1 migrations apply DB --local`. Create a gitignored `.dev.vars` file containing `INGEST_TOKEN=<a local-only test token>`, then run `npm run dev`. Never commit or share tokens. `GET /health` reports process health, and `GET /v1/offers?location=T2P%201J9` returns at most 100 offers. `POST /v1/ingest/offers` requires an `Authorization: Bearer` token and an `{ "offers": [...] }` payload from the collector's mock uploader. Mock offers are marked `sample: true` in responses. Uploads are upserted by provider, ID, and postal code.

## Development deployment (approval required)

The configuration names Worker `platewise-api-dev` and database `platewise-dev` with the UUID supplied by the owner. This is configuration only; the live binding has not been verified. Authenticate to the intended Cloudflare account and verify its database identity before any remote changes. After explicit approval, from this directory run:

```sh
npx wrangler d1 migrations list DB --remote
npx wrangler d1 migrations apply DB --remote
npx wrangler deploy
```

Set the secret interactively using `npx wrangler secret put INGEST_TOKEN --name platewise-api-dev`; enter the value at the hidden prompt. Coordinate the same secret securely with the collector's execution environment, never frontend code. Secret setup and deployment may need the Worker to exist first. The exact deployed URL is not known until deployment. Remote migrations, deployment, live binding, and secret setup have not been performed.

Real data requires an authorized source, a reviewed ingestion contract and provider-specific permissions. Do not use the unofficial Flipp adapter for automated collection or publication without authorization. Review access controls, request size limits, abuse protection, data retention and operational monitoring before public production use.
