type Price = { amountCents:number; currency:'CAD'; text:string; purchaseQuantity:number; purchaseUnit:string };
type RunOffer = { sourceOfferId:string; retailer:{sourceRetailerId:string;displayName:string}; productName:string; price:Price; validFrom:string|null; validUntil:string|null; observedAt:string; isSample:boolean; seenIn?:string[] };
export type RunPayload = { schemaVersion:1; run:{id:string;source:'mock'|'flipp';searchPostalCode:string;startedAt:string;finishedAt:string;status:'completed'|'partial'|'failed';isSample:boolean;market?:string}; offers:RunOffer[]; rejections:{recordReference:string;reasonCode:string}[] };
const obj = (v:unknown): v is Record<string,unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v:unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 200;
const instant = (v:unknown): v is string => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v.slice(0,10);
const day = (v:unknown): boolean => v === null || (typeof v === 'string' && /^\d{4}-\d\d-\d\d$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v);
const postal = /^[A-Z]\d[A-Z] ?\d[A-Z]\d$/i;
const compact = (code:string) => code.toUpperCase().replace(/\s/g,'');
// A market run covers an area, so its market slug is stored as the location.
export const storageLocation = (run:RunPayload['run']) => run.market ?? compact(run.searchPostalCode);
// Flipp is real data, so it needs ALLOW_LICENSED_IMPORTS and must not be labelled as a sample.
export function validateRun(v:unknown, allowLicensed = false): v is RunPayload {
  if (!obj(v) || v.schemaVersion !== 1 || !obj(v.run) || !Array.isArray(v.offers) || v.offers.length > 100 || !Array.isArray(v.rejections) || v.rejections.length > 100) return false;
  const r = v.run;
  if (!str(r.id) || (r.source !== 'mock' && !(allowLicensed && r.source === 'flipp')) || r.isSample !== (r.source === 'mock') || !['completed','partial','failed'].includes(String(r.status)) || !str(r.searchPostalCode) || !postal.test(r.searchPostalCode) || !instant(r.startedAt) || !instant(r.finishedAt) || Date.parse(r.finishedAt) < Date.parse(r.startedAt)) return false;
  if (r.market !== undefined && (typeof r.market !== 'string' || !/^[a-z0-9-]{1,50}$/.test(r.market))) return false;
  const ids = new Set<string>();
  for (const o of v.offers) {
    if (!obj(o) || !str(o.sourceOfferId) || ids.has(o.sourceOfferId) || !obj(o.retailer) || !str(o.retailer.sourceRetailerId) || !str(o.retailer.displayName) || !str(o.productName) || o.isSample !== r.isSample || !obj(o.price)) return false;
    ids.add(o.sourceOfferId);
    if (o.seenIn !== undefined && (!Array.isArray(o.seenIn) || o.seenIn.length < 1 || o.seenIn.length > 20 || !o.seenIn.every(c => typeof c === 'string' && postal.test(c)))) return false;
    const p = o.price;
    if (!Number.isSafeInteger(p.amountCents) || (p.amountCents as number) < 0 || p.currency !== 'CAD' || !str(p.text) || typeof p.purchaseQuantity !== 'number' || !Number.isFinite(p.purchaseQuantity) || p.purchaseQuantity <= 0 || !str(p.purchaseUnit) || !day(o.validFrom) || !day(o.validUntil) || (typeof o.validFrom === 'string' && typeof o.validUntil === 'string' && o.validFrom > o.validUntil) || !instant(o.observedAt) || Date.parse(o.observedAt) < Date.parse(r.startedAt) || Date.parse(o.observedAt) > Date.parse(r.finishedAt)) return false;
  }
  const rejected = new Set<string>();
  for (const x of v.rejections) { if (!obj(x) || !str(x.recordReference) || !str(x.reasonCode)) return false; const key=JSON.stringify([x.recordReference,x.reasonCode]); if (rejected.has(key)) return false; rejected.add(key); }
  return true;
}

export async function storeRun(db:D1Database, data:RunPayload, hash:string): Promise<'created'|'replayed'|'conflict'> {
  const {run, offers, rejections} = data;
  const location = storageLocation(run);
  const find = () => db.prepare('SELECT payload_hash AS hash FROM collection_runs WHERE id = ?').bind(run.id).first<{hash:string}>();
  const existing = await find();
  if (existing) return existing.hash === hash ? 'replayed' : 'conflict';
  const statements = [db.prepare('INSERT INTO collection_runs(id,provider,location,status,schema_version,payload_hash,started_at,finished_at,fetched_count,accepted_count,rejected_count) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(run.id,run.source,location,run.status,1,hash,run.startedAt,run.finishedAt,offers.length+new Set(rejections.map(r=>r.recordReference)).size,offers.length,new Set(rejections.map(r=>r.recordReference)).size)];
  for (const o of offers) statements.push(db.prepare('INSERT INTO offer_observations(run_id,provider,offer_id,location,product_name,retailer,source_retailer_id,price_cents,currency,price_text,quantity,unit,valid_from,valid_until,observed_at,product_key,seen_postal_codes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(run.id,run.source,o.sourceOfferId,location,o.productName,o.retailer.displayName,o.retailer.sourceRetailerId,o.price.amountCents,o.price.currency,o.price.text,o.price.purchaseQuantity,o.price.purchaseUnit,o.validFrom,o.validUntil,o.observedAt,productKey(o.retailer.displayName,o.productName),o.seenIn ? JSON.stringify(o.seenIn.map(compact)) : null));
  for (const r of snapshotRows(data)) statements.push(db.prepare('INSERT INTO offers(provider,id,location,product_name,retailer,price,currency,valid_until,collected_at,price_cents,price_text,quantity,unit,valid_from,product_key,source_offer_id,source_run_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(provider,id,location) DO UPDATE SET product_name=excluded.product_name,retailer=excluded.retailer,price=excluded.price,currency=excluded.currency,valid_until=excluded.valid_until,collected_at=excluded.collected_at,price_cents=excluded.price_cents,price_text=excluded.price_text,quantity=excluded.quantity,unit=excluded.unit,valid_from=excluded.valid_from,product_key=excluded.product_key,source_offer_id=excluded.source_offer_id,source_run_id=excluded.source_run_id WHERE excluded.collected_at >= offers.collected_at').bind(run.source,r.id,location,r.productName,r.retailer,r.price,r.currency,r.validUntil,r.collectedAt,r.priceCents,r.priceText,r.quantity,r.unit,r.validFrom,r.id,r.sourceOfferId,run.id));
  for (const x of rejections) statements.push(db.prepare('INSERT INTO collection_rejections(run_id,record_key,reason_code) VALUES (?,?,?)').bind(run.id,x.recordReference,x.reasonCode));
  try { await db.batch(statements); return 'created'; } catch (error) { const result = await find(); if (result) return result.hash === hash ? 'replayed' : 'conflict'; throw error; }
}

// Matching key only: uppercase, no accents or apostrophes, other punctuation as spaces. Display text is stored separately.
const normalize = (v:string) => v.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/['\u2019`]/g,'').replace(/[^A-Z0-9.]+/g,' ').replace(/(^|\s)\.+|\.+(?=\s|$)/g,' ').replace(/\s+/g,' ').trim();
export function productKey(retailer:string, productName:string): string|null {
  const r = normalize(retailer), n = normalize(productName);
  return r && n ? `${r}|${n}` : null;
}

export type SnapshotRow = { id:string; productName:string; retailer:string; price:number; priceCents:number; currency:'CAD'; priceText:string; quantity:number; unit:string; validFrom:string|null; validUntil:string|null; collectedAt:string; sourceOfferId:string };
// One row per product for the offers snapshot. Failed runs write nothing; a product seen at
// more than one price in a run (e.g. two sizes under one name) is ambiguous and skipped.
export function snapshotRows(data:RunPayload): SnapshotRow[] {
  if (data.run.status === 'failed') return [];
  const groups = new Map<string,RunOffer[]>();
  for (const o of data.offers) { const key = productKey(o.retailer.displayName,o.productName); if (key) groups.set(key,[...(groups.get(key) ?? []),o]); }
  const rows:SnapshotRow[] = [];
  for (const [id,group] of groups) {
    if (new Set(group.map(o=>o.price.amountCents)).size > 1) continue;
    const o = group.reduce((a,b) => b.observedAt > a.observedAt ? b : a);
    rows.push({ id, productName:o.productName, retailer:o.retailer.displayName, price:o.price.amountCents/100, priceCents:o.price.amountCents, currency:o.price.currency, priceText:o.price.text, quantity:o.price.purchaseQuantity, unit:o.price.purchaseUnit, validFrom:o.validFrom, validUntil:o.validUntil, collectedAt:o.observedAt, sourceOfferId:o.sourceOfferId });
  }
  return rows;
}
