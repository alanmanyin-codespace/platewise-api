type Price = { amountCents:number; currency:'CAD'; text:string; purchaseQuantity:number; purchaseUnit:string };
type RunOffer = { sourceOfferId:string; retailer:{sourceRetailerId:string;displayName:string}; productName:string; price:Price; validFrom:string|null; validUntil:string|null; observedAt:string; isSample:true };
export type RunPayload = { schemaVersion:1; run:{id:string;source:'mock';searchPostalCode:string;startedAt:string;finishedAt:string;status:'completed'|'partial'|'failed';isSample:true}; offers:RunOffer[]; rejections:{recordReference:string;reasonCode:string}[] };
const obj = (v:unknown): v is Record<string,unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v:unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 200;
const instant = (v:unknown): v is string => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v.slice(0,10);
const day = (v:unknown): boolean => v === null || (typeof v === 'string' && /^\d{4}-\d\d-\d\d$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v);
export function validateRun(v:unknown): v is RunPayload {
  if (!obj(v) || v.schemaVersion !== 1 || !obj(v.run) || !Array.isArray(v.offers) || v.offers.length > 100 || !Array.isArray(v.rejections) || v.rejections.length > 100) return false;
  const r = v.run;
  if (!str(r.id) || r.source !== 'mock' || r.isSample !== true || !['completed','partial','failed'].includes(String(r.status)) || !str(r.searchPostalCode) || !/^[A-Z]\d[A-Z] ?\d[A-Z]\d$/i.test(r.searchPostalCode) || !instant(r.startedAt) || !instant(r.finishedAt) || Date.parse(r.finishedAt) < Date.parse(r.startedAt)) return false;
  const ids = new Set<string>();
  for (const o of v.offers) {
    if (!obj(o) || !str(o.sourceOfferId) || ids.has(o.sourceOfferId) || !obj(o.retailer) || !str(o.retailer.sourceRetailerId) || !str(o.retailer.displayName) || !str(o.productName) || o.isSample !== true || !obj(o.price)) return false;
    ids.add(o.sourceOfferId);
    const p = o.price;
    if (!Number.isSafeInteger(p.amountCents) || (p.amountCents as number) < 0 || p.currency !== 'CAD' || !str(p.text) || typeof p.purchaseQuantity !== 'number' || !Number.isFinite(p.purchaseQuantity) || p.purchaseQuantity <= 0 || !str(p.purchaseUnit) || !day(o.validFrom) || !day(o.validUntil) || (typeof o.validFrom === 'string' && typeof o.validUntil === 'string' && o.validFrom > o.validUntil) || !instant(o.observedAt) || Date.parse(o.observedAt) < Date.parse(r.startedAt) || Date.parse(o.observedAt) > Date.parse(r.finishedAt)) return false;
  }
  const rejected = new Set<string>();
  for (const x of v.rejections) { if (!obj(x) || !str(x.recordReference) || !str(x.reasonCode)) return false; const key=JSON.stringify([x.recordReference,x.reasonCode]); if (rejected.has(key)) return false; rejected.add(key); }
  return true;
}

export async function storeRun(db:D1Database, data:RunPayload, hash:string): Promise<'created'|'replayed'|'conflict'> {
  const {run, offers, rejections} = data;
  const location = run.searchPostalCode.toUpperCase().replace(/\s/g,'');
  const find = () => db.prepare('SELECT payload_hash AS hash FROM collection_runs WHERE id = ?').bind(run.id).first<{hash:string}>();
  const existing = await find();
  if (existing) return existing.hash === hash ? 'replayed' : 'conflict';
  const statements = [db.prepare('INSERT INTO collection_runs(id,provider,location,status,schema_version,payload_hash,started_at,finished_at,fetched_count,accepted_count,rejected_count) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(run.id,run.source,location,run.status,1,hash,run.startedAt,run.finishedAt,offers.length+new Set(rejections.map(r=>r.recordReference)).size,offers.length,new Set(rejections.map(r=>r.recordReference)).size)];
  for (const o of offers) statements.push(db.prepare('INSERT INTO offer_observations(run_id,provider,offer_id,location,product_name,retailer,source_retailer_id,price_cents,currency,price_text,quantity,unit,valid_from,valid_until,observed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(run.id,run.source,o.sourceOfferId,location,o.productName,o.retailer.displayName,o.retailer.sourceRetailerId,o.price.amountCents,o.price.currency,o.price.text,o.price.purchaseQuantity,o.price.purchaseUnit,o.validFrom,o.validUntil,o.observedAt));
  for (const x of rejections) statements.push(db.prepare('INSERT INTO collection_rejections(run_id,record_key,reason_code) VALUES (?,?,?)').bind(run.id,x.recordReference,x.reasonCode));
  try { await db.batch(statements); return 'created'; } catch (error) { const result = await find(); if (result) return result.hash === hash ? 'replayed' : 'conflict'; throw error; }
}
