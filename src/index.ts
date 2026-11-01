import { validateOffers } from './validation.js';
interface Env { DB: D1Database; INGEST_TOKEN?: string }
const json = (body: unknown, status = 200) => Response.json(body, {status, headers:{'Cache-Control':'no-store'}});
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') return json({ status:'ok' });
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
