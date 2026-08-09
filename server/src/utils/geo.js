const EARTH_RADIUS_KM = 6371;

const toRad = (deg) => (deg * Math.PI) / 180;

/**
 * Great-circle distance between two [lng, lat] pairs, in kilometres.
 */
export function haversineKm(a, b) {
  if (!a || !b) return null;
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export const isValidCoords = (coords) =>
  Array.isArray(coords) &&
  coords.length === 2 &&
  coords.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
  Math.abs(coords[0]) <= 180 &&
  Math.abs(coords[1]) <= 90;
