export const VISIT_RADIUS_M = 20;
export const MAX_FIX_AGE_MS = 15000;

export function distanceMeters(a, b) {
  const rad = Math.PI / 180;
  const lat1 = Number(a.lat) * rad, lat2 = Number(b.lat) * rad;
  const dLat = (Number(b.lat) - Number(a.lat)) * rad;
  const dLon = (Number(b.lng) - Number(a.lng)) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// Konzervativní pravidlo: celý kruh udávané nejistoty musí ležet v okruhu bodu.
export function visitEligibility(point, fix, now = Date.now()) {
  if (!fix || !Number.isFinite(fix.lat) || !Number.isFinite(fix.lng) ||
      !Number.isFinite(fix.accuracy) || fix.accuracy < 0 ||
      !Number.isFinite(fix.timestamp) || fix.timestamp > now + 2000 ||
      now - fix.timestamp > MAX_FIX_AGE_MS) return { ok: false, reason: "Čekám na čerstvou polohu GPS." };
  const distance = distanceMeters(point, fix);
  if (fix.accuracy > VISIT_RADIUS_M) return { ok: false, distance, reason: "GPS je zatím příliš nepřesná." };
  if (distance + fix.accuracy > VISIT_RADIUS_M) return { ok: false, distance, reason: "Přibližte se k místu." };
  return { ok: true, distance, reason: "" };
}
