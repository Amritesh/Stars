export class SensorManager {
  constructor(onUpdate) {
    this.onUpdate = onUpdate;
    this.heading = 0;
    this.pitch = 0;
    this.calibrationOffset = parseFloat(localStorage.getItem('stars_north_offset') || '0');
    this.pitchOffset = parseFloat(localStorage.getItem('stars_pitch_offset') || '0');
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
    // User requested inversion: Pitch = Beta - 90?
    // Let's assume the user holds the phone such that screen faces them.
    // Standard: Upright (beta=90). Tilted Back (screen to sky, beta < 90).
    // If user says "Jupiter is up but pointer says down", it means:
    // Target Alt = 45. Current Pitch (90-beta) = 0. Diff = +45. "Tilt UP".
    // If user follows "Tilt UP" (tilts back), beta becomes 45. Pitch = 45. Aligned.
    
    // BUT user says "exactly opposite side that is pointing up".
    // Maybe on their device beta behaves differently?
    // Or maybe they are holding it differently.
    // Let's try inverting the logic as requested: Pitch = Beta - 90.
    // Upright (beta=90) -> Pitch=0.
    // Tilted Back (beta=45) -> Pitch=-45.
    // Tilted Forward (beta=135) -> Pitch=45.
    // This implies "looking up" requires tilting forward?
    
    // Reverting to beta - 90 based on user feedback that 90-beta was inverted.
    let rawPitch = beta - 90;
    
    // Apply Pitch Offset
    rawPitch = rawPitch + this.pitchOffset;

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

  setPitchCalibration() {
    // We want current pitch to be 0 (Horizon)
    // current = raw_pitch + offset
    // 0 = raw_pitch + new_offset
    // new_offset = -raw_pitch
    // raw_pitch = current - old_offset
    
    // Calculate raw pitch from current smoothed pitch and existing offset
    // Note: this.pitch is the smoothed value including the offset.
    // smoothed_pitch = (prev * s) + ((raw + offset) * (1-s))
    // This is complex because of smoothing.
    // Simpler approximation: assume smoothed value has converged.
    // current_pitch_output = smoothed_pitch (which includes offset)
    
    // We want 0 = current_pitch_output - old_offset + new_offset
    // No wait.
    // We effectively just want to zero the current reading.
    // Current Reading C = Raw + OldOffset
    // New Reading C' = Raw + NewOffset = 0
    // Raw = C - OldOffset
    // NewOffset = -Raw = -(C - OldOffset) = OldOffset - C
    
    this.pitchOffset = this.pitchOffset - this.pitch;
    localStorage.setItem('stars_pitch_offset', this.pitchOffset);
    return this.pitchOffset;
  }
}
