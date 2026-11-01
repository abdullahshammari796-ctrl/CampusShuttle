/**
 * Small geodesy toolkit. Campus distances are a few kilometres, so a local
 * equirectangular projection is accurate to well under 1 m and keeps the
 * route-snapping maths simple (plain 2-D vectors).
 */
export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface XY {
  x: number;
  y: number;
}

const EARTH_RADIUS_M = 6_371_008.8;
const RAD = Math.PI / 180;

export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const dLat = (b.lat - a.lat) * RAD;
  const dLng = (b.lng - a.lng) * RAD;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function toLocalXY(p: GeoPoint, ref: GeoPoint): XY {
  return {
    x: (p.lng - ref.lng) * RAD * EARTH_RADIUS_M * Math.cos(ref.lat * RAD),
    y: (p.lat - ref.lat) * RAD * EARTH_RADIUS_M,
  };
}

export function fromLocalXY(p: XY, ref: GeoPoint): GeoPoint {
  return {
    lat: ref.lat + p.y / (RAD * EARTH_RADIUS_M),
    lng: ref.lng + p.x / (RAD * EARTH_RADIUS_M * Math.cos(ref.lat * RAD)),
  };
}

export function isValidCoordinate(p: { lat: unknown; lng: unknown }): p is GeoPoint {
  return (
    typeof p.lat === 'number' && Number.isFinite(p.lat) && p.lat >= -90 && p.lat <= 90 &&
    typeof p.lng === 'number' && Number.isFinite(p.lng) && p.lng >= -180 && p.lng <= 180
  );
}
