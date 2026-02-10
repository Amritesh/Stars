export class SensorManager {
  constructor(onUpdate) {
    this.onUpdate = onUpdate;
    this.heading = 0;
    this.pitch = 0;
    this.calibrationOffset = parseFloat(localStorage.getItem('stars_north_offset') || '0');
    this.alpha = 0;
    this.beta = 0;
    this.gamma = 0;
    
    // Smoothing factor (0 = no smoothing, 1 = no update)
    this.smoothing = 0.85; 
  }

  async requestPermission() {
    if (typeof DeviceOrientationEvent !== 'undefined' && 
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const response = await DeviceOrientationEvent.requestPermission();
        if (response === 'granted') {
          this.start();
          return true;
        } else {
          alert('Permission denied');
          return false;
        }
      } catch (e) {
        console.error(e);
        return false;
      }
    } else {
      // Non-iOS 13+ devices
      this.start();
      return true;
    }
  }

  start() {
    window.addEventListener('deviceorientationabsolute', this.handleOrientation, true);
    // Fallback for devices that don't support absolute
    window.addEventListener('deviceorientation', this.handleOrientation, true);
  }

  handleOrientation = (event) => {
    let { alpha, beta, gamma, absolute } = event;

    // Use absolute if available (Android Chrome), otherwise relative (iOS/desktop)
    // On Android, 'deviceorientationabsolute' is preferred for compass heading.
    // If event.absolute is true, alpha is relative to Earth's frame.
    
    // Basic null check
    if (alpha === null || beta === null || gamma === null) return;

    // --- HEADING CALCULATION ---
    // Standard web convention:
    // alpha: 0=North, 90=West, 180=South, 270=East (Counter-clockwise? No, usually varies)
    // Android Chrome: 0=North, increases Counter-Clockwise? Or Clockwise?
    // It's a mess. We usually need `360 - alpha` to get Clockwise from North.
    // iOS webkitCompassHeading is Clockwise from North.

    let rawHeading;
    
    if (event.webkitCompassHeading) {
      // iOS: direct magnetic heading (0=N, 90=E)
      rawHeading = event.webkitCompassHeading;
    } else {
      // Android / Standard
      // typically alpha is 0 at North, increasing counter-clockwise
      // so we do 360 - alpha to get standard compass (N=0, E=90)
      rawHeading = 360 - alpha;
    }

    // Normalize to 0-360
    rawHeading = (rawHeading + 360) % 360;

    // Apply calibration offset
    let calibratedHeading = (rawHeading + this.calibrationOffset + 360) % 360;


    // --- PITCH CALCULATION ---
    // beta: -180 to 180. 0 when flat on table. 90 when upright.
    // We want pitch relative to horizon.
    // When holding phone upright (portrait):
    // beta is ~90. Tilted back (screen to sky) -> beta < 90. Tilted fwd -> beta > 90.
    // We want 0 at horizon, +90 at zenith (straight up), -90 at nadir.
    // So: pitch = beta - 90
    // Wait, let's verify.
    // Flat table: beta=0. Pitch should be 90 (looking straight up from back camera? No, screen up).
    // If we look *through* the phone at the sky:
    // Holding upright: beta=90. Camera points at Horizon. Pitch should be 0.
    // Tilted back 45deg: beta=45. Camera points at +45deg alt. Pitch = 45.
    // Flat on table: beta=0. Camera points at +90deg (Zenith). Pitch = 90.
    // So Pitch = 90 - beta.
    
    // Let's re-read standard:
    // Beta is front-to-back tilt.
    // 0 = flat. 90 = upright.
    // If we want "Camera looking angle":
    // Upright (90) -> Horizon (0 deg alt)
    // Flat (0) -> Zenith (90 deg alt)
    // So, CameraPitch = 90 - beta.
    
    let rawPitch = 90 - beta;
    // Clamp to -90 to +90?
    // Actually, if user tilts past zenith (phone upside down), beta goes > 90 or < 0?
    // For simple usage, 90-beta works for standard range.

    // --- SMOOTHING ---
    // Low-pass filter to remove jitter
    // We need to smooth heading carefully around the 0/360 wrap.
    
    this.heading = this.smoothAngle(this.heading, calibratedHeading);
    this.pitch = (this.pitch * this.smoothing) + (rawPitch * (1 - this.smoothing));
    
    this.alpha = alpha;
    this.beta = beta;
    this.gamma = gamma;

    this.onUpdate({
      heading: this.heading,
      pitch: this.pitch,
      raw: { alpha, beta, gamma }
    });
  }

  smoothAngle(current, target) {
    // Calculate shortest difference
    let diff = target - current;
    while (diff < -180) diff += 360;
    while (diff > 180) diff -= 360;

    // Apply smoothing
    return (current + diff * (1 - this.smoothing) + 360) % 360;
  }

  setCalibration() {
    // Current raw heading (without offset) should become 0 (North)
    // calibrated = (raw + offset) % 360
    // We want calibrated = 0
    // 0 = (raw + offset)
    // offset = -raw
    
    // We need to re-calculate raw heading from current state
    // Just reverse the current applied offset
    // calibrated_current = (raw + old_offset)
    // raw = calibrated_current - old_offset
    
    let currentRaw = (this.heading - this.calibrationOffset + 360) % 360;
    
    // We want the USER to be facing North when they click this.
    // So currentRaw corresponds to actual North (0).
    // So 0 = (currentRaw + newOffset)
    // newOffset = -currentRaw
    
    this.calibrationOffset = -currentRaw;
    localStorage.setItem('stars_north_offset', this.calibrationOffset);
    return this.calibrationOffset;
  }
}
