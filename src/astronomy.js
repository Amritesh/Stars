import { Body, Equator, Observer, Horizon } from 'astronomy-engine';

export const BODIES = [
  { name: 'Sun', id: Body.Sun },
  { name: 'Moon', id: Body.Moon },
  { name: 'Mercury', id: Body.Mercury },
  { name: 'Venus', id: Body.Venus },
  { name: 'Mars', id: Body.Mars },
  { name: 'Jupiter', id: Body.Jupiter },
  { name: 'Saturn', id: Body.Saturn },
];

/**
 * Calculates Alt/Az for all tracked bodies for a given observer and time.
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {Date} date - Current date/time
 * @returns {Array} List of body objects with computed alt/az
 */
export function getCelestialPositions(lat, lon, date) {
  const observer = new Observer(lat, lon, 0);
  
  return BODIES.map(body => {
    // 1. Get equatorial coordinates (RA/Dec)
    const equator = Equator(body.id, date, observer, true, true);
    // 2. Convert to Horizon coordinates (Alt/Az)
    const horizon = Horizon(date, observer, equator.ra, equator.dec, 'normal');

    return {
      ...body,
      alt: horizon.altitude,
      az: horizon.azimuth,
      status: getStatus(horizon.altitude)
    };
  });
}

function getStatus(alt) {
  if (alt < 0) return 'BELOW HORIZON';
  if (alt < 5) return 'ABOVE HORIZON'; // Close to horizon, maybe obscured
  return 'GOOD';
}

/**
 * Helper to format degrees nicely
 */
export function formatDeg(deg) {
  return deg.toFixed(1) + '°';
}
