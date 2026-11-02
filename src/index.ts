import { validateOffers } from './validation.js';
import { storeRun, validateRun } from './runs.js';
interface Env { DB: D1Database; INGEST_TOKEN?: string }
const json = (body: unknown, status = 200) => Response.json(body, {status, headers:{'Cache-Control':'no-store'}});
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') return json({ status:'ok' });
    if (request.method === 'GET' && url.pathname === '/v1/observations') {
      const location = url.searchParams.get('location');
      if (location !== null && !/^[A-Z]\d[A-Z] ?\d[A-Z]\d$/i.test(location)) return json({error:'Invalid location'},400);
      const sql = 'SELECT run_id AS runId, provider AS source, offer_id AS sourceOfferId, location, product_name AS productName, retailer, source_retailer_id AS sourceRetailerId, price_cents AS priceCents, currency, price_text AS priceText, quantity AS purchaseQuantity, unit AS purchaseUnit, valid_from AS validFrom, valid_until AS validUntil, observed_at AS observedAt FROM offer_observations';
      const result = location ? await env.DB.prepare(sql+' WHERE location = ? ORDER BY observed_at DESC LIMIT 100').bind(location.toUpperCase().replace(/\s/g,'')).all() : await env.DB.prepare(sql+' ORDER BY observed_at DESC LIMIT 100').all();
      return json({observations:result.results.map(row=>({...row,isSample:true}))});
    }
    if (request.method === 'POST' && url.pathname === '/v1/ingest/runs') {
      if (!env.INGEST_TOKEN || request.headers.get('Authorization') !== `Bearer ${env.INGEST_TOKEN}`) return json({error:'Unauthorized'},401);
      if (Number(request.headers.get('content-length') ?? 0) > 100000) return json({error:'Payload too large'},413);
      const reader = request.body?.getReader(); if (!reader) return json({error:'Invalid JSON'},400);
      const chunks:Uint8Array[] = []; let size = 0;
      while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 100000) { await reader.cancel(); return json({error:'Payload too large'},413); } chunks.push(part.value); }
      const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
      let body:unknown; try { body = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)); } catch { return json({error:'Invalid JSON'},400); }
      if (!validateRun(body)) return json({error:'Invalid or unsupported synthetic run'},400);
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
      const result = await storeRun(env.DB,body,hash);
      if (result === 'conflict') return json({error:'Run ID already used with a different payload'},409);
      return json({status:result,accepted:body.offers.length},result === 'created' ? 201 : 200);
    }
    if (request.method === 'GET' && url.pathname === '/v1/offers') {
      const location = url.searchParams.get('location');
      if (location !== null && !/^[A-Z]\d[A-Z] ?\d[A-Z]\d$/i.test(location)) return json({error:'Invalid location'},400);
      const query = 'SELECT id, product_name AS productName, retailer, location, price, currency, valid_until AS validUntil, collected_at AS collectedAt, provider FROM offers';
      const result = location ? await env.DB.prepare(query+' WHERE location = ? ORDER BY collected_at DESC LIMIT 100').bind(location.toUpperCase().replace(/\s/g,'')).all() : await env.DB.prepare(query+' ORDER BY collected_at DESC LIMIT 100').all();
      return json({offers:result.results.map(row => ({...row, sample:true}))});
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
