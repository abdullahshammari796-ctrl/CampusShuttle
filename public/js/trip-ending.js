// Ending a trip from the driver app.
//
// The trip ends on this device only after the server confirms it. Until then
// GPS keeps running and positions keep queueing, so if the request fails
// (no network, session expired, server down) the trip is still active
// everywhere and the driver can simply try again.

import { ApiError } from './api.js';

/**
 * @param {object} options
 * @param {string} options.tripId
 * @param {import('./gps.js').LocationUploader | null} options.uploader
 * @param {(tripId: string) => Promise<unknown>} options.requestEnd sends the end-trip request
 * @param {number} [options.drainTimeoutMs] how long to wait for queued positions to be delivered first
 * @returns {Promise<{ outcome: 'ended' | 'already-ended' | 'failed', error?: Error, undelivered: number }>}
 *   `undelivered`: positions still queued on the device; after 'ended' they belong to a finished trip and are discarded.
 */
export async function endTripSafely({ tripId, uploader, requestEnd, drainTimeoutMs = 5000 }) {
  if (uploader) {
    // Deliver what was recorded during the trip (waits for an upload already in
    // flight), then hold new positions so no upload races the end request.
    await uploader.drain(drainTimeoutMs);
    uploader.pause();
  }
  const undelivered = () => (uploader ? uploader.queue.length : 0);
  try {
    await requestEnd(tripId);
    return { outcome: 'ended', undelivered: undelivered() };
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 409)) {
      // The server no longer has this trip as active (ended by the office or auto-closed).
      return { outcome: 'already-ended', error, undelivered: undelivered() };
    }
    if (uploader) uploader.resume(); // not confirmed: the trip is still active, keep sharing location
    return { outcome: 'failed', error, undelivered: undelivered() };
  }
}
