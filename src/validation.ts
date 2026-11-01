export interface Offer { id:string; productName:string; retailer:string; location:string; price:number; currency:'CAD'; validUntil:string; collectedAt:string; provider:'mock' }
export function validateOffers(body: unknown): body is { offers: Offer[] } {
  if (!body || typeof body !== 'object' || !('offers' in body) || !Array.isArray(body.offers) || body.offers.length < 1 || body.offers.length > 100) return false;
  return body.offers.every((v: unknown) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
    const o = v as Record<string, unknown>;
    const text = (x: unknown) => typeof x === 'string' && x.trim().length > 0 && x.length <= 200;
    const date = typeof o.validUntil === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.validUntil) && !Number.isNaN(Date.parse(o.validUntil)) && new Date(o.validUntil).toISOString().slice(0,10) === o.validUntil;
    return text(o.id) && text(o.productName) && text(o.retailer) && typeof o.location === 'string' && /^[A-Z]\d[A-Z] ?\d[A-Z]\d$/i.test(o.location) && typeof o.price === 'number' && Number.isFinite(o.price) && o.price >= 0 && o.currency === 'CAD' && date && typeof o.collectedAt === 'string' && !Number.isNaN(Date.parse(o.collectedAt)) && o.provider === 'mock';
  });
}
