import type { Role } from '../identity/model.ts';
import type { Route, Shuttle, Stop } from '../network/model.ts';
import { type GeoPoint, fromLocalXY } from '../shared/geo.ts';

/**
 * DEMONSTRATION DATA ONLY.
 * Stop names, coordinates, routes, vehicles and accounts are invented for
 * the prototype. Coordinates are illustrative positions in Dubai and do not
 * describe any real university's shuttle service.
 */
const ORIGIN: GeoPoint = { lat: 25.2, lng: 55.26 };
const at = (x: number, y: number): GeoPoint => {
  const p = fromLocalXY({ x, y }, ORIGIN);
  return { lat: round(p.lat), lng: round(p.lng) };
};
const round = (v: number) => Math.round(v * 1e6) / 1e6;

const stop = (id: string, name: string, x: number, y: number, description: string): Stop => ({ id, name, ...at(x, y), description });

export const DEMO_STOPS: Stop[] = [
  stop('main-gate', 'Main Gate', 0, 0, 'Covered shelter outside security gate 1.'),
  stop('library', 'Library & Learning Commons', 400, 120, 'Drop-off bay facing the library entrance.'),
  stop('engineering', 'Engineering Building', 500, 500, 'East side, next to the labs car park.'),
  stop('residences', 'Student Residences', 150, 700, 'Residence reception roundabout.'),
  stop('sports', 'Sports Complex', -250, 450, 'Main entrance of the sports hall.'),
  stop('innovation-out', 'Innovation Hub (to Metro)', 600, -560, 'Outbound bay on the service road.'),
  stop('metro', 'Metro Station Link', 1150, -950, 'Shuttle bay at the station footbridge.'),
  stop('innovation-in', 'Innovation Hub (to Campus)', 594, -566, 'Inbound bay opposite the outbound stop.'),
  stop('parking-b', 'Parking B', -300, 100, 'Next to the parking-B pay station.'),
];

const pts = (xy: Array<[number, number]>): GeoPoint[] => xy.map(([x, y]) => at(x, y));

export const DEMO_ROUTES: Array<Omit<Route, 'updatedAt'>> = [
  {
    id: 'campus-loop',
    name: 'Campus Loop',
    color: '#2563eb',
    stopIds: ['main-gate', 'library', 'engineering', 'residences', 'sports'],
    path: pts([
      [0, 0], [200, 0], [330, 40], [400, 120], [480, 250], [500, 500], [450, 620], [330, 690],
      [150, 700], [-50, 670], [-200, 580], [-250, 450], [-260, 300], [-200, 120], [-100, 30],
    ]),
    loop: true,
    nominalSpeedKmh: 18,
    dwellSeconds: 20,
    active: true,
  },
  {
    // Out-and-back on the same road (two lanes ~8 m apart): exercises the
    // window-based route snapping that avoids jumping to the opposite lane.
    id: 'metro-link',
    name: 'Metro Link',
    color: '#d97706',
    stopIds: ['main-gate', 'innovation-out', 'metro', 'innovation-in'],
    path: pts([
      [0, 0], [0, -150], [300, -400], [600, -560], [900, -780], [1150, -950], [1190, -975], [1180, -1000],
      [1144, -956], [894, -786], [594, -566], [294, -406], [-6, -156], [-6, -6],
    ]),
    loop: true,
    nominalSpeedKmh: 30,
    dwellSeconds: 25,
    active: true,
  },
  {
    id: 'evening-express',
    name: 'Evening Express',
    color: '#7c3aed',
    stopIds: ['residences', 'sports', 'parking-b', 'main-gate'],
    path: pts([[150, 700], [-250, 450], [-300, 100], [0, 0]]),
    loop: true,
    nominalSpeedKmh: 22,
    dwellSeconds: 20,
    active: false,
  },
];

export const DEMO_SHUTTLES: Shuttle[] = [
  { id: 'sh-01', label: 'Shuttle 01', plate: 'DEMO-01', capacity: 22, active: true },
  { id: 'sh-02', label: 'Shuttle 02', plate: 'DEMO-02', capacity: 22, active: true },
  { id: 'sh-03', label: 'Shuttle 03', plate: 'DEMO-03', capacity: 30, active: true },
  { id: 'sh-04', label: 'Shuttle 04', plate: 'DEMO-04', capacity: 14, active: true },
];

/**
 * Demo accounts for local testing only. These passwords are published in
 * the README and must never be used outside a local demonstration.
 */
export const DEMO_USERS: Array<{ id: string; username: string; displayName: string; role: Role; password: string }> = [
  { id: 'u-student-1', username: 'student1', displayName: 'Demo Student 1', role: 'student', password: 'student-demo' },
  { id: 'u-student-2', username: 'student2', displayName: 'Demo Student 2', role: 'student', password: 'student-demo' },
  { id: 'u-driver-1', username: 'driver1', displayName: 'Demo Driver 1', role: 'driver', password: 'driver-demo' },
  { id: 'u-driver-2', username: 'driver2', displayName: 'Demo Driver 2', role: 'driver', password: 'driver-demo' },
  { id: 'u-driver-3', username: 'driver3', displayName: 'Demo Driver 3', role: 'driver', password: 'driver-demo' },
  { id: 'u-office-1', username: 'office1', displayName: 'Transport Office (demo)', role: 'office', password: 'office-demo' },
];

/** Relative popularity of each stop in the synthetic demand generator (an assumption, not data). */
export const SYNTHETIC_STOP_WEIGHTS: Record<string, number> = {
  'main-gate': 1.0,
  library: 0.8,
  engineering: 0.7,
  residences: 1.1,
  sports: 0.35,
  'innovation-out': 0.45,
  metro: 1.2,
  'innovation-in': 0.3,
  'parking-b': 0.25,
};
