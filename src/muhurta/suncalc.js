
// Minimal solar calculations based on NOAA equations
// Returns times in Date objects

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

function toJulian(date) {
  // Returns Julian Date for the UTC time of the date object
  return date.valueOf() / 86400000 - 0.5 + 2440588;
}

function fromJulian(j) {
  // Returns Date object from Julian Date (in UTC)
  return new Date((j + 0.5 - 2440588) * 86400000);
}

function toDays(date) {
  // Days since J2000.0 (Jan 1 2000 12:00 UTC)
  return toJulian(date) - 2451545.0;
}

function getSunCoords(d) {
  const M = (357.5291 + 0.98560028 * d) % 360;
  const L = (280.4665 + 0.98564736 * d) % 360;
  
  const seq = Math.sin(M * D2R) * (1.9148 - 0.004817 * d / 36525) + 
              Math.sin(2 * M * D2R) * 0.0200 + 
              Math.sin(3 * M * D2R) * 0.0003;
              
  const lambda = (L + seq + 180 + 360) % 360 - 180; // True Longitude
  
  // Obliquity of ecliptic
  const obliq = 23.4393 - 0.0000004 * d;
  
  const alpha = Math.atan2(Math.cos(obliq * D2R) * Math.sin(lambda * D2R), Math.cos(lambda * D2R)) * R2D;
  const delta = Math.asin(Math.sin(obliq * D2R) * Math.sin(lambda * D2R)) * R2D;
  
  return { dec: delta, ra: alpha };
}

function getSunriseSunset(date, lat, lng) {
    // Problem Analysis:
    // The previous feedback shows Sunrise: 17:48 (5:48 PM) and Sunset: 05:13 (5:13 AM).
    // This is exactly reversed (Sunrise at PM, Sunset at AM).
    // This typically happens if the Julian Date estimation 'n' is calculated for a longitude that results in a transit
    // time close to midnight UTC instead of noon, or if the hour angle sign is flipped.
    
    // Let's look at the standard algorithm.
    // n = round(d - 0.0009 - lng/360)
    // J* = Noon UTC + n - lng/360
    
    // If we are in Asia (+5.5h), Noon Local is 06:30 UTC.
    // If we feed 'd' as Noon Local (06:30 UTC), n should be close to 0.
    
    // Let's be very explicit about the date we want.
    // We want the sunrise/sunset for the LOCAL calendar day.
    // So we pick Noon Local Time as our estimation point.
    const noonLocal = new Date(date);
    noonLocal.setHours(12, 0, 0, 0);
    
    // Get Julian Day for this moment
    const d = toDays(noonLocal);
    
    const lw = -lng * D2R;
    const phi = lat * D2R;
    
    // n is the number of days since J2000.0
    // The formula n = round(d - 0.0009 - lng/360) finds the cycle number.
    const n = Math.round(d - 0.0009 - lng / 360);
    
    // Estimated solar noon (J_star)
    const J_star = 2451545.0 + 0.0009 + lng / 360 + n;
    
    // Solar Mean Anomaly
    const M = (357.5291 + 0.98560028 * (J_star - 2451545)) % 360;
    
    // Equation of Center
    const C = 1.9148 * Math.sin(M * D2R) + 0.0200 * Math.sin(2 * M * D2R) + 0.0003 * Math.sin(3 * M * D2R);
    
    // Ecliptic Longitude
    const lambda = (M + 102.9372 + C + 180) % 360;
    
    // Solar Transit (J_transit)
    const J_transit = J_star + 0.0053 * Math.sin(M * D2R) - 0.0069 * Math.sin(2 * lambda * D2R);
    
    // Sun Declination at Transit
    const sun = getSunCoords(J_transit - 2451545);
    
    // Hour Angle
    const H0 = -0.833; // Standard altitude for sunrise/sunset
    
    // cosH calculation
    const cosH = (Math.sin(H0 * D2R) - Math.sin(phi) * Math.sin(sun.dec * D2R)) / 
                 (Math.cos(phi) * Math.cos(sun.dec * D2R));
    
    if (cosH < -1 || cosH > 1) {
        return null; // Polar day/night
    }
    
    // H is hour angle in degrees
    const H = Math.acos(cosH) * R2D;
    
    // Sunrise = Transit - H
    // Sunset = Transit + H
    // BUT: Longitude convention matters.
    // In this formula, J_transit is already adjusted for longitude.
    // J_transit is the time the sun crosses the meridian at 'lng'.
    
    // Let's verify the inputs.
    // Lat 23.81, Lon 86.47 (Asia).
    // lng = 86.47. lw = -1.5 rad.
    // J_star ~= J_noon_utc - (86.47/360) = J_noon_utc - 0.24 days (-5.7 hours).
    // So Transit is ~ 6:18 AM UTC.
    // 6:18 AM UTC + 5:30 = 11:48 AM IST. This is correct for solar noon.
    
    // If calculated Sunrise is 17:48 (Local?), that means UTC was 12:18?
    // 12:18 UTC is ~18:00 Local. That's Sunset time, but labeled Sunrise.
    
    // Standard formula:
    // Rise = Transit - H/360
    // Set = Transit + H/360
    
    // Why did it flip?
    // Maybe H came out negative? Math.acos returns [0, PI], so H is positive [0, 180].
    // So J_rise must be < J_transit.
    
    // Wait, let's look at the PREVIOUS result carefully.
    // "Sunrise 17:48". (5:48 PM).
    // "Sunset 05:13". (5:13 AM).
    // This is definitely flipped.
    
    // Did we swap lat/lng?
    // Caller: computeMuhurta(date, lat, lon)
    // Inside: getSunriseSunset(date, lat, lon)
    // Inside: const lw = -lng * D2R; const phi = lat * D2R;
    // Seems correct.
    
    // Did we swap the return values?
    // return { sunrise: fromJulian(J_rise), sunset: fromJulian(J_set) }
    // J_rise = J_transit - H/360.
    
    // If H is positive, J_rise is earlier.
    
    // Let's look at the longitude formula again.
    // J_star = ... + lng / 360 ...
    // Standard NOAA: n* = J - 2451545 - 0.0009 + lw/360
    // where lw is West Longitude (positive to West).
    // My input `lng` is usually East positive (standard map apps).
    // If `lng` is East (positive), then -lng/360 should be used if the formula expects West.
    
    // NOAA definitions:
    // longitude is positive to the WEST in many astronomical algorithms.
    // Standard Maps: East is Positive.
    // If I passed +86.47 (East), and the formula expected West...
    // J_star would be Noon + 0.24 days = Noon + 6 hours = 6 PM UTC.
    // 6 PM UTC is 11:30 PM IST. (Midnight!).
    // Transit at Midnight? That's the anti-sun.
    // Sunrise relative to Midnight - 6h = 6 PM.
    // Sunset relative to Midnight + 6h = 6 AM.
    // Bingo.
    
    // Fix: Invert longitude for the calculation if the formula assumes West positive.
    // My code: `const J_star = 2451545.0 + 0.0009 + lng / 360 + n;`
    // If lng is East (+), we are adding time.
    // Earth rotates West to East.
    // Places to the East see noon EARLIER.
    // So JD of noon should be smaller.
    // So we should SUBTRACT longitude.
    // J_star = ... - lng / 360 ...
    
    // Let's verify `lng` usage in n calculation too.
    // n = round(d - 0.0009 - lng/360) -> This was subtracting.
    // J_star = ... + lng/360 -> This was adding.
    // This inconsistency is the bug.
    
    // Correct Formula (assuming lng is East Positive):
    // n = round(d - 0.0009 - lng/360)
    // J_star = 2451545.0 + 0.0009 - lng / 360 + n
    
    // Wait, let's derive simply.
    // J_noon_utc = J_ref + n
    // We want J such that Local Mean Time = 12:00.
    // UTC = Local - Offset.
    // Offset for East is positive (+5.5h).
    // So UTC of noon is earlier.
    // So J_transit < J_noon_utc.
    // So we must subtract (lng/360).
    
    // So:
    // const J_star = 2451545.0 + 0.0009 - lng / 360 + n;
    
    // Let's fix the `n` calculation too just to be consistent.
    // n is the cycle number.
    // d is roughly the current JD.
    // We want to find the nearest n to (d - offset).
    // offset is (lng/360).
    // so n = round(d - (ref - offset)) ?
    // No, standard is: n = round(d - J2000 - 0.0009 + lngWest/360)
    // If lng is East Positive, lngWest = -lng.
    // n = round(d - J2000 - 0.0009 - lng/360).
    // J* = J2000 + 0.0009 + lngWest/360 + n
    // J* = J2000 + 0.0009 - lng/360 + n
    
    const J2000 = 2451545.0;
    
    // Fix: Subtract lng/360 instead of adding
    const n_cycle = Math.round(d - 0.0009 - (lng / 360));
    const J_approx = J2000 + 0.0009 - (lng / 360) + n_cycle;
    
    // Recalculate everything with correct J_approx
    const M_new = (357.5291 + 0.98560028 * (J_approx - J2000)) % 360;
    const C_new = 1.9148 * Math.sin(M_new * D2R) + 0.0200 * Math.sin(2 * M_new * D2R) + 0.0003 * Math.sin(3 * M_new * D2R);
    const lambda_new = (M_new + 102.9372 + C_new + 180) % 360;
    const J_transit_new = J_approx + 0.0053 * Math.sin(M_new * D2R) - 0.0069 * Math.sin(2 * lambda_new * D2R);
    
    const sun_new = getSunCoords(J_transit_new - J2000);
    const cosH_new = (Math.sin(H0 * D2R) - Math.sin(phi) * Math.sin(sun_new.dec * D2R)) / 
                     (Math.cos(phi) * Math.cos(sun_new.dec * D2R));
    
    if (cosH_new < -1 || cosH_new > 1) return null;
    
    const H_new = Math.acos(cosH_new) * R2D;
    const J_rise_new = J_transit_new - H_new / 360;
    const J_set_new = J_transit_new + H_new / 360;
    
    return {
        sunrise: fromJulian(J_rise_new),
        sunset: fromJulian(J_set_new),
        solarNoon: fromJulian(J_transit_new)
    };
}

export function computeMuhurta(date, lat, lon) {
    // 1. Calculate Sunrise/Sunset for the given date
    const times = getSunriseSunset(date, lat, lon);
    
    if (!times) {
        return { error: "No sunrise/sunset at this location today." };
    }

    const sunrise = times.sunrise;
    const sunset = times.sunset;

    // 2. Brahma Muhurta: Ends 48 mins before sunrise, lasts 48 mins.
    // So Start = Sunrise - 96 min. End = Sunrise - 48 min.
    const brahmaStart = new Date(sunrise.getTime() - 96 * 60000);
    const brahmaEnd = new Date(sunrise.getTime() - 48 * 60000);

    // 3. Pratah Sandhya: Sunrise +/- 24 min
    const pratahStart = new Date(sunrise.getTime() - 24 * 60000);
    const pratahEnd = new Date(sunrise.getTime() + 24 * 60000);

    // 4. Sayam Sandhya: Sunset +/- 24 min
    const sayamStart = new Date(sunset.getTime() - 24 * 60000);
    const sayamEnd = new Date(sunset.getTime() + 24 * 60000);

    return {
        sunrise,
        sunset,
        brahma: { start: brahmaStart, end: brahmaEnd },
        pratahSandhya: { start: pratahStart, end: pratahEnd },
        sayamSandhya: { start: sayamStart, end: sayamEnd },
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };
}
