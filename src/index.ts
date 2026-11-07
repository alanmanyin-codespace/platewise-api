import { readPage, validateOffers } from './validation.js';
import { storeRun, validateRun } from './runs.js';
import { storeRecipes, validateRecipes } from './recipes.js';
interface Env { DB: D1Database; INGEST_TOKEN?: string; ALLOW_LICENSED_IMPORTS?: string }
const json = (body: unknown, status = 200) => Response.json(body, {status, headers:{'Cache-Control':'no-store'}});
// ?market=calgary or ?location=T2P%201J9; null means no filter, undefined means invalid.
const readArea = (url:URL): string|null|undefined => {
  const market = url.searchParams.get('market'), location = url.searchParams.get('location');
  if (market !== null) return /^[a-z0-9-]{1,50}$/.test(market) && location === null ? market : undefined;
  if (location === null) return null;
  return /^[A-Z]\d[A-Z] ?\d[A-Z]\d$/i.test(location) ? location.toUpperCase().replace(/\s/g,'') : undefined;
};
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') return json({ status:'ok' });
    if (request.method === 'GET' && url.pathname === '/v1/observations') {
      const area = readArea(url);
      if (area === undefined) return json({error:'Invalid location'},400);
      const sql = 'SELECT run_id AS runId, provider AS source, offer_id AS sourceOfferId, location, product_name AS productName, retailer, source_retailer_id AS sourceRetailerId, price_cents AS priceCents, currency, price_text AS priceText, quantity AS purchaseQuantity, unit AS purchaseUnit, valid_from AS validFrom, valid_until AS validUntil, observed_at AS observedAt, seen_postal_codes AS seenPostalCodes FROM offer_observations';
      const result = area ? await env.DB.prepare(sql+' WHERE provider = \'mock\' AND location = ? ORDER BY observed_at DESC LIMIT 100').bind(area).all() : await env.DB.prepare(sql+' WHERE provider = \'mock\' ORDER BY observed_at DESC LIMIT 100').all();
      return json({observations:result.results.map(row=>({...row,seenPostalCodes:row.seenPostalCodes ? JSON.parse(String(row.seenPostalCodes)) : null,isSample:true}))});
    }
    if (request.method === 'POST' && url.pathname === '/v1/ingest/runs') {
      if (!env.INGEST_TOKEN || request.headers.get('Authorization') !== `Bearer ${env.INGEST_TOKEN}`) return json({error:'Unauthorized'},401);
      if (Number(request.headers.get('content-length') ?? 0) > 100000) return json({error:'Payload too large'},413);
      const reader = request.body?.getReader(); if (!reader) return json({error:'Invalid JSON'},400);
      const chunks:Uint8Array[] = []; let size = 0;
      while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 100000) { await reader.cancel(); return json({error:'Payload too large'},413); } chunks.push(part.value); }
      const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
      let body:unknown; try { body = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)); } catch { return json({error:'Invalid JSON'},400); }
      if (!validateRun(body, env.ALLOW_LICENSED_IMPORTS === 'true')) return json({error:'Invalid or unsupported run'},400);
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
      const result = await storeRun(env.DB,body,hash);
      if (result === 'conflict') return json({error:'Run ID already used with a different payload'},409);
      return json({status:result,accepted:body.offers.length},result === 'created' ? 201 : 200);
    }
    if (url.pathname === '/v1/ingest/recipes') {
      if (!env.INGEST_TOKEN || request.headers.get('Authorization') !== `Bearer ${env.INGEST_TOKEN}`) return json({error:'Unauthorized'},401);
      if (request.method === 'GET') {
        const result = await env.DB.prepare('SELECT source_id AS id FROM recipes WHERE source = ?').bind(url.searchParams.get('source') ?? 'themealdb').all<{id:string}>();
        return json({ids:result.results.map(row => row.id)});
      }
      if (request.method === 'POST') {
        if (Number(request.headers.get('content-length') ?? 0) > 100000) return json({error:'Payload too large'},413);
        let body:unknown; try { body = await request.json(); } catch { return json({error:'Invalid JSON'},400); }
        if (!validateRecipes(body)) return json({error:'Invalid recipes'},400);
        await storeRecipes(env.DB,body,new Date().toISOString());
        return json({accepted:body.recipes.length});
      }
    }
    if (request.method === 'GET' && url.pathname === '/v1/offers') {
      const area = readArea(url);
      if (area === undefined) return json({error:'Invalid location'},400);
      const query = 'SELECT id, product_name AS productName, retailer, location, price, price_cents AS priceCents, currency, price_text AS priceText, valid_until AS validUntil, collected_at AS collectedAt, provider, source_offer_id AS sourceOfferId, source_run_id AS sourceRunId FROM offers';
      const page = readPage(url);
      if (!page) return json({error:'Invalid limit or offset'},400);
      // One extra row shows whether another page exists. id keeps the order stable when timestamps tie.
      const order = ' ORDER BY collected_at DESC, id LIMIT ? OFFSET ?';
      const result = area ? await env.DB.prepare(query+' WHERE provider = \'flipp\' AND location = ?'+order).bind(area,page.limit+1,page.offset).all() : await env.DB.prepare(query+' WHERE provider = \'flipp\''+order).bind(page.limit+1,page.offset).all();
      const rows = result.results.slice(0,page.limit);
      return json({offers:rows.map(row => ({...row, sample:false})),nextOffset:result.results.length > page.limit ? page.offset+page.limit : null});
    }
    if (request.method === 'POST' && url.pathname === '/v1/ingest/offers') {
      const auth = request.headers.get('Authorization');
      if (!env.INGEST_TOKEN || auth !== `Bearer ${env.INGEST_TOKEN}`) return json({error:'Unauthorized'},401);
      if (Number(request.headers.get('content-length') ?? 0) > 100000) return json({error:'Payload too large'},413);
      let body: unknown; try { body = await request.json(); } catch { return json({error:'Invalid JSON'},400); }
      if (!validateOffers(body)) return json({error:'Invalid offers; only synthetic mock offers are accepted'},400);
      await env.DB.batch(body.offers.map(o => env.DB.prepare('INSERT INTO offers (provider,id,location,product_name,retailer,price,currency,valid_until,collected_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(provider,id,location) DO UPDATE SET product_name=excluded.product_name,retailer=excluded.retailer,price=excluded.price,currency=excluded.currency,valid_until=excluded.valid_until,collected_at=excluded.collected_at WHERE excluded.collected_at >= offers.collected_at').bind(o.provider,o.id,o.location.toUpperCase().replace(/\s/g,''),o.productName,o.retailer,o.price,o.currency,o.validUntil,o.collectedAt)));
      return json({accepted:body.offers.length});
    }
    return json({error:'Not found'},404);
  }
};
