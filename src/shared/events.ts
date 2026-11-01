/**
 * Domain events exchanged over the event bus. Events carry identifiers and
 * primitive facts only ("event notification" style); subscribers that need
 * more detail ask the owning module, which keeps modules decoupled.
 */
export type DomainEvent =
  | { type: 'trip.started'; tripId: string; routeId: string; shuttleId: string; at: number }
  | { type: 'trip.ended'; tripId: string; routeId: string; status: string; reason: string; at: number }
  | { type: 'trip.location'; tripId: string; at: number }
  | { type: 'trip.signal'; tripId: string; status: string; previous: string; at: number }
  | { type: 'trip.occupancy'; tripId: string; level: string; at: number }
  | { type: 'stop.arrived'; tripId: string; routeId: string; stopId: string; at: number }
  | { type: 'waiting.changed'; stopId: string; waiting: number; at: number }
  | { type: 'network.changed'; routeId: string; at: number };

export type DomainEventType = DomainEvent['type'];
