import './style.css';
import './muhurta.css';
import { getCelestialPositions, formatDeg } from './astronomy.js';
import { MuhurtaScreen } from './muhurta/ui.js';

// --- Sensor Handling ---
class SensorManager {
  constructor(onUpdate) {
    this.onUpdate = onUpdate;
    this.heading = 0; // 0=North, 90=East
    this.pitch = 0;   // 0=Horizon, 90=Zenith
    this.calibrationOffset = parseFloat(localStorage.getItem('stars_north_offset') || '0');
    this.pitchOffset = parseFloat(localStorage.getItem('stars_pitch_offset') || '0');
    
    // Smoothing (simple low-pass)
    this.alpha = 0.15; // Higher = less smoothing, more responsive
  }

  requestPermission() {
    if (typeof DeviceOrientationEvent !== 'undefined' && 
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      return DeviceOrientationEvent.requestPermission()
        .then(response => {
          if (response === 'granted') {
            this.start();
            return true;
          }
          return false;
        })
        .catch(() => false);
    } else {
      this.start();
      return Promise.resolve(true);
    }
  }

  start() {
    window.addEventListener('deviceorientationabsolute', this.handleOrientation, true);
    // Fallback for non-absolute support
    window.addEventListener('deviceorientation', this.handleOrientation, true);
  }

  handleOrientation = (event) => {
    let alpha = event.alpha; // Z-axis rotation [0,360)
    let beta = event.beta;   // X-axis rotation [-180,180) (front-back tilt)
    let gamma = event.gamma; // Y-axis rotation [-90,90) (left-right tilt)

    // Android Chrome 'deviceorientationabsolute' gives alpha=0 at North.
    // Standard 'deviceorientation' varies.
    // iOS 'webkitCompassHeading' is available on 'deviceorientation'.
    
    let heading = 0;

    if (event.webkitCompassHeading) {
      // iOS: direct heading (0=N, 90=E)
      heading = event.webkitCompassHeading;
    } else if (event.absolute || event.type === 'deviceorientationabsolute') {
      // Android: alpha=0 is North, usually increases Counter-Clockwise?
      // Actually standard is: Z-axis is up, alpha is rotation around Z.
      // 0=North, 90=West?
      // Let's assume standard web compass: 360 - alpha.
      heading = 360 - alpha;
    } else {
      // Fallback relative orientation - user must calibrate
      heading = 360 - alpha; 
    }
    
    // Normalize [0, 360)
    heading = (heading + 360) % 360;

    // Apply User Offset
    heading = (heading + this.calibrationOffset + 360) % 360;

    // Calculate Pitch (Altitude of phone camera)
    // Beta is 90 when upright (portrait), 0 when flat.
    // We want 0 at Horizon, 90 at Zenith.
    // So Pitch = Beta - 90?
    // Wait. Upright (beta=90) -> Pointing at Horizon (Alt=0).
    // Flat (beta=0) -> Pointing at Zenith (Alt=90).
    // Tilted back 45deg (screen up) -> beta=45 -> Pointing at Alt=45.
    // So Pitch = 90 - beta.
    // However, some Android devices report beta inverted or in a different range.
    // User reported that looking at Zenith resulted in "Tilt UP", meaning pitch was too low.
    // If we invert the sign?
    // Let's try: Pitch = Beta - 90.
    // Upright (90) -> 0.
    // Flat (0) -> -90 (Nadir).
    // This seems wrong for "Standard" orientation.
    
    // But if the user's device reports beta increasing as they tilt back?
    // Or if the user is holding it differently.
    
    // Let's try a safer approach:
    // If the user says it's wrong, we'll invert the mapping logic based on their feedback.
    // They are looking at Zenith (target 90), and it says "Tilt Up" (current < 90).
    // Wait, if they are AT Zenith, and it says "Tilt Up", it thinks they are NOT at Zenith.
    // Maybe they are at Beta=180? (Face down?)
    
    // Let's assume the user's device has a different convention or the calculation needs to be:
    // pitch = beta - 90 (if beta goes 90->180 as you tilt back?)
    
    // Actually, on some devices:
    // Upright: 90.
    // Tilt Back: 180 (flat)? No, standard is 0.
    
    // FIX applied based on user feedback:
    // "Tilt up and tilt down are swapped and the sign of tilt is also incorrect...
    // if something is 30 degree above horizon it is asking me to point 30 degree below horizon."
    
    // Interpreting the user's issue:
    // 1. "Sign of tilt is incorrect":
    //    - If target is +30 (Above Horizon), user is pointing at what they think is +30.
    //    - App thinks they are pointing at -30 (Below Horizon).
    //    - App says "Tilt UP" (from -30 to +30).
    //    - But user is already looking UP.
    //    - This means the calculated pitch is inverted.
    //    - Instead of +30, we are calculating -30.
    //    - This suggests we need `pitch = -pitch`.
    
    // 2. "Tilt up and tilt down are swapped":
    //    - If I am too low (pitch 0, target 30), I should "Tilt UP".
    //    - If the app says "Tilt DOWN" instead, then the instruction logic is swapped OR the sign difference is wrong.
    
    // Let's assume the standard back-camera usage:
    // Upright (Beta 90) -> Pitch 0.
    // Screen Down (Beta 180) -> Pitch +90.
    // Formula: pitch = beta - 90.
    
    // If user's device gives Beta=0 for Screen Down (non-standard but possible on some weird implementations? Or user error?):
    // Then pitch = 0 - 90 = -90.
    // If they want +90, we need a formula that maps 0 -> +90.
    // And if Upright is still 90 -> 0.
    // Function: f(90)=0, f(0)=90.
    // f(beta) = 90 - beta.
    
    // NEW FEEDBACK:
    // "moving camera up it is decreasing tilt... whereas it should be increase"
    // "moving camera to floor it is increasing to 90... whereas it should be -90"
    
    // Current Formula: pitch = 90 - beta.
    
    // Scenario 1: Moving Camera UP (Tilting Screen Back/Down).
    // User says pitch is DECREASING.
    // So (90 - beta) decreases. => beta is INCREASING.
    // This means as they look up, beta goes 90 -> 100 -> 110...
    
    // Scenario 2: Moving Camera to Floor (Tilting Screen Forward/Up).
    // User says pitch is INCREASING to 90.
    // So (90 - beta) increases to 90. => beta goes to 0.
    // This implies Upright=90, Floor=0.
    // Result = 90 - 0 = +90.
    // User says "should be -90".
    
    // Summary of Physics on User's Device:
    // Upright: Beta ~ 90.
    // Floor (Camera Down): Beta ~ 0.
    // Sky (Camera Up): Beta ~ 180.
    
    // Goal:
    // Upright -> 0.
    // Floor (Beta=0) -> -90.
    // Sky (Beta=180) -> +90.
    
    // Let's test `beta - 90` again?
    // Upright (90): 90 - 90 = 0.
    // Floor (0): 0 - 90 = -90. (Matches "should be -90").
    // Sky (180): 180 - 90 = +90. (Matches "should be increase").
    
    // Wait, the PREVIOUS code was `beta - 90`.
    // And the user complained about that too?
    // "Tilt up and tilt down are swapped and the sign of tilt is also incorrect"
    
    // Let's re-read the FIRST complaint.
    // "if something is 30 degree above horizon it is asking me to point 30 degree below horizon"
    // Target = +30.
    // Instruction: "Point 30 degree below".
    // This implies App thought current pitch was too high?
    // OR App thought Target was below?
    
    // If we use `beta - 90`:
    // User points at +30 (Sky). Beta=120. Pitch=30.
    // Target=+30. Diff=0. Aligned.
    
    // Maybe the user's first report was confused or I misinterpreted it.
    // The LATEST report is very specific about raw behavior.
    // "moving camera to floor... increasing to 90... should be -90".
    // Current (90-beta) gave +90 at Floor (Beta=0).
    // User wants -90.
    // This confirms Floor corresponds to Beta=0.
    // And we want Output = -90.
    
    // "moving camera up... decreasing... should be increase".
    // Current (90-beta) gave decreasing.
    // User wants increasing.
    // This confirms Sky corresponds to Beta > 90.
    
    // So we definitely need `beta - 90`.
    
    // Why did `beta - 90` fail before?
    // "Tilt up and tilt down are swapped".
    // If I am at 0, Target is +30. Diff = +30.
    // Instruction should be "Tilt UP".
    // If instruction said "Tilt DOWN", then instruction logic was swapped.
    
    // Let's check the instruction logic I see now:
    // altDiff = target - current.
    // if altDiff > 0 (Target is higher), "Tilt UP".
    // This logic is CORRECT.
    
    // So if the formula is `beta - 90` AND logic is `Target > Current => UP`, it should work.
    
    // Maybe the user's "Tilt up and tilt down are swapped" meant:
    // "I am tilting up, but the numbers go down".
    // (Which happens if we used `90-beta` when we should have used `beta-90`).
    // BUT the original code WAS `beta - 90`.
    
    // Is it possible the user's device has Beta go 90 -> 0 for Sky?
    // If Sky -> Beta=0.
    // `beta - 90`: 0 - 90 = -90. (Wrong direction).
    // `90 - beta`: 90 - 0 = +90. (Correct direction).
    
    // Let's look at the "Floor" comment again.
    // "moving camera to point to floor".
    // Does this mean "Screen Up, Camera Down" (Flat on table)?
    // Or "Top of phone pointing to floor" (Portrait, tilted forward)?
    // Usually "point camera to floor" means the back camera looks at the floor.
    // This can be done by holding phone flat (Screen Up).
    // Or by holding phone upright and tilting forward.
    
    // User said: "moving camera to point to floor it is increasing to a maximum of 90".
    // My code `90 - beta` resulted in +90.
    // 90 - beta = 90 => beta = 0.
    // So "Point to Floor" => Beta = 0.
    
    // User said: "whereas it should be -90".
    // So "Point to Floor" should be -90.
    
    // So mapping: Beta=0 => Pitch=-90.
    // Upright (Beta=90) => Pitch=0.
    
    // This requires `pitch = beta - 90`.
    // 0 - 90 = -90.
    // 90 - 90 = 0.
    
    // So the formula MUST be `beta - 90`.
    
    // Why did the user complain initially?
    // "if something is 30 degree above horizon it is asking me to point 30 degree below horizon."
    // Target = +30.
    // Instruction: "Point 30 degree below". (Tilt DOWN).
    // This means App thinks Current Pitch is > Target.
    // Current > 30.
    // If they were pointing at Horizon (0).
    // App thought they were at 60? (60 > 30 => Tilt Down).
    // `beta - 90`: Beta=90 => Pitch=0. (Correct).
    
    // Maybe they were pointing at the object (+30)?
    // If they point at +30 (Beta=120). Pitch=30.
    // Target=30. Diff=0.
    
    // What if the user has `beta` inverted? (90 -> 180 for Floor, 90 -> 0 for Sky).
    // "Point to Floor" (Beta=180).
    // `beta - 90`: 180 - 90 = +90.
    // User wants -90.
    // `90 - beta`: 90 - 180 = -90. (Matches!)
    
    // "Point to Sky" (Beta=0).
    // `beta - 90`: 0 - 90 = -90. (Wrong).
    // `90 - beta`: 90 - 0 = +90. (Matches!)
    
    // SO:
    // If User Device: Floor=0, Sky=180 -> Use `beta - 90`.
    // If User Device: Floor=180, Sky=0 -> Use `90 - beta`.
    
    // User said regarding `90 - beta`:
    // "moving camera to floor... increasing to 90".
    // So `90 - beta` -> 90.
    // 90 - beta = 90 => beta = 0.
    // So User Device Floor = 0.
    
    // THEREFORE: User Device Floor = 0.
    // AND User wants Floor = -90.
    // This implies `beta - 90` is the correct formula (0 - 90 = -90).
    
    // So we are going BACK to `beta - 90`.
    // But we must ensure the "Tilt Instructions" are clear.
    
    // "saying tilt down when it should be saying tilt up".
    // Scenario: Pointing at Floor (-90). Target Horizon (0).
    // Diff = 0 - (-90) = +90.
    // Logic: Diff > 0 => "Tilt UP".
    // User says "says to tilt down".
    // This means my previous logic for text might have been wrong?
    // My previous logic: `altDiff > 0 ? "Tilt UP" : "Tilt DOWN"`.
    // That seems correct.
    
    // Wait, the user said "says to tilt down" regarding the `90 - beta` version.
    // In `90 - beta` version:
    // Point at Floor (Beta=0) -> Pitch = +90.
    // Target = 0.
    // Diff = 0 - 90 = -90.
    // Logic: Diff < 0 => "Tilt DOWN".
    // App said "Tilt DOWN".
    // User (physically at floor) knows they need to Tilt UP.
    // So App gave wrong instruction because calculated pitch (+90) was wrong (should be -90).
    
    // So, the root cause IS the pitch formula.
    // It MUST be `beta - 90`.
    
    let pitch = beta - 90;
    
    // Apply Pitch Offset
    pitch = pitch + this.pitchOffset;

    // Smoothing
    // Handle wrap-around for heading
    let diff = heading - this.heading;
    while (diff < -180) diff += 360;
    while (diff > 180) diff -= 360;
    this.heading = (this.heading + diff * this.alpha + 360) % 360;
    
    this.pitch = this.pitch + (pitch - this.pitch) * this.alpha;

    this.onUpdate({ heading: this.heading, pitch: this.pitch, raw: { alpha, beta, gamma } });
  }

  calibrateCurrentAsNorth() {
    // We want current heading to be 0 (North)
    // current = (raw + offset) % 360
    // 0 = (raw + new_offset)
    // new_offset = -raw
    // raw = current - old_offset
    
    let raw = (this.heading - this.calibrationOffset + 360) % 360;
    this.calibrationOffset = -raw;
    localStorage.setItem('stars_north_offset', this.calibrationOffset);
  }

  calibrateCurrentAsHorizon() {
    // We want current pitch to be 0 (Horizon)
    // current = raw_pitch + offset
    // 0 = raw_pitch + new_offset
    // new_offset = -raw_pitch
    // raw_pitch = current - old_offset
    
    let rawPitch = this.pitch - this.pitchOffset;
    this.pitchOffset = -rawPitch;
    localStorage.setItem('stars_pitch_offset', this.pitchOffset);
  }
}


// --- Main App Logic ---

const appState = {
  lat: null,
  lon: null,
  targetBody: null, // { name, alt, az }
  currentHeading: 0,
  currentPitch: 0,
  isLocked: false
};

let sensorManager;

// Elements
const screens = {
  start: document.getElementById('start-screen'),
  list: document.getElementById('list-screen'),
  pointer: document.getElementById('pointer-screen'),
  muhurta: document.getElementById('muhurta-screen')
};

// UI Helpers
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active', 'hidden'));
  Object.values(screens).forEach(s => s.classList.add('hidden'));
  screens[name].classList.remove('hidden');
  screens[name].classList.add('active');
}

// 1. Start / Permissions
document.getElementById('start-btn').addEventListener('click', async () => {
  // Geolocation
  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        appState.lat = pos.coords.latitude;
        appState.lon = pos.coords.longitude;
        document.getElementById('loc-latlon').textContent = 
          `${appState.lat.toFixed(2)}, ${appState.lon.toFixed(2)}`;
        initApp();
      },
      (err) => {
        alert('Location needed to find stars! Using default (0,0).');
        appState.lat = 0;
        appState.lon = 0;
        initApp();
      }
    );
  } else {
    alert('Geolocation not supported.');
    appState.lat = 0;
    appState.lon = 0;
    initApp();
  }

  // Sensors
  sensorManager = new SensorManager((data) => {
    appState.currentHeading = data.heading;
    appState.currentPitch = data.pitch;
    updatePointerUI();
    
    // Debug
    if (!document.getElementById('debug-overlay').classList.contains('hidden')) {
      document.getElementById('debug-log').textContent = 
        `H: ${data.heading.toFixed(1)} P: ${data.pitch.toFixed(1)}\n` +
        `Raw A:${data.raw.alpha?.toFixed(1)} B:${data.raw.beta?.toFixed(1)} G:${data.raw.gamma?.toFixed(1)}`;
    }
  });

  const granted = await sensorManager.requestPermission();
  if (!granted) {
    document.getElementById('permission-status').textContent = "Sensors denied. App may not work.";
  }
});

function initApp() {
  showScreen('list');
  updateObjectList();
  setInterval(updateObjectList, 10000); // Refresh positions every 10s
}

// 2. Object List
function updateObjectList() {
  if (appState.lat === null) return;
  
  const bodies = getCelestialPositions(appState.lat, appState.lon, new Date());
  const listEl = document.getElementById('objects-list');
  listEl.innerHTML = '';

  bodies.forEach(body => {
    const card = document.createElement('div');
    card.className = 'object-card';
    
    let statusClass = 'status-above';
    if (body.status === 'BELOW HORIZON') statusClass = 'status-below';
    if (body.status === 'GOOD') statusClass = 'status-good';

    card.innerHTML = `
      <div>
        <strong>${body.name}</strong>
        <span class="status-badge ${statusClass}">${body.status}</span>
      </div>
      <div style="text-align:right; font-size:0.9rem;">
        <div>Az: ${formatDeg(body.az)}</div>
        <div>Alt: ${formatDeg(body.alt)}</div>
      </div>
    `;
    
    card.addEventListener('click', () => startTracking(body));
    listEl.appendChild(card);
  });
}

// 3. Pointer Mode
function startTracking(body) {
  appState.targetBody = body;
  showScreen('pointer');
  document.getElementById('target-name').textContent = body.name;
  
  // Initial update
  updatePointerUI();
}

document.getElementById('back-btn').addEventListener('click', () => {
  showScreen('list');
  appState.targetBody = null;
});

function updatePointerUI() {
  if (!appState.targetBody || screens.pointer.classList.contains('hidden')) return;

  const target = appState.targetBody;
  
  // Calculate Diffs
  // Azimuth diff: shortest path [-180, 180]
  let azDiff = target.az - appState.currentHeading;
  while (azDiff < -180) azDiff += 360;
  while (azDiff > 180) azDiff -= 360;

  // Altitude diff
  let altDiff = target.alt - appState.currentPitch;

  // UI Updates
  document.getElementById('target-coords').textContent =
    `Alt: ${formatDeg(target.alt)} Az: ${formatDeg(target.az)}`;

  // Update new orientation display
  document.getElementById('orientation-display').textContent =
    `Facing: ${Math.round(appState.currentHeading)}°, Tilt: ${Math.round(appState.currentPitch)}°`;
  
  const turnMsg = document.getElementById('turn-msg');
  const tiltMsg = document.getElementById('tilt-msg');
  const arrow = document.getElementById('pointer-arrow');
  const lock = document.getElementById('lock-indicator');

  // Tolerance Check (6 degrees)
  const isAligned = Math.abs(azDiff) < 6 && Math.abs(altDiff) < 6;

  if (isAligned) {
    if (!appState.isLocked) {
      // Just locked
      if (navigator.vibrate) navigator.vibrate(100);
      appState.isLocked = true;
    }
    arrow.classList.add('hidden');
    lock.classList.remove('hidden');
    turnMsg.textContent = "ALIGNED";
    tiltMsg.textContent = "ALIGNED";
  } else {
    appState.isLocked = false;
    arrow.classList.remove('hidden');
    lock.classList.add('hidden');

    // Turn Instructions
    if (Math.abs(azDiff) < 2) {
      turnMsg.textContent = "Face: OK";
    } else {
      turnMsg.textContent = azDiff > 0 ? `Turn RIGHT ${formatDeg(azDiff)}` : `Turn LEFT ${formatDeg(Math.abs(azDiff))}`;
    }

    // Tilt Instructions
    if (Math.abs(altDiff) < 2) {
      tiltMsg.textContent = "Tilt: OK";
    } else {
      // altDiff = target - current.
      // If target (30) > current (0), diff is +30. We need to increase pitch.
      // Instructions should guide the user's physical action.
      // "Tilt UP" usually means "Point the camera higher".
      tiltMsg.textContent = altDiff > 0 ? `Tilt UP ${formatDeg(altDiff)}` : `Tilt DOWN ${formatDeg(Math.abs(altDiff))}`;
    }

    // Arrow Rotation
    // Rotate arrow to point towards target relative to screen up
    // We want the arrow to point in the direction we need to move the phone.
    // Actually, usually 2D arrow points to the target Azimuth relative to North.
    // Screen Up is Current Heading.
    // Target is at Target Azimuth.
    // Angle relative to screen up = Target Az - Current Heading = azDiff.
    // So rotate arrow by azDiff.
    arrow.style.transform = `rotate(${azDiff}deg)`;
  }
  
  // Warning
  const warn = document.getElementById('status-message');
  if (target.alt < 0) {
    warn.textContent = "Target is Below Horizon!";
    warn.classList.remove('hidden');
  } else {
    warn.classList.add('hidden');
  }
}


// --- Calibration ---
const calModal = document.getElementById('calibration-modal');
document.getElementById('calibrate-btn').addEventListener('click', () => {
  calModal.classList.remove('hidden');
});
document.getElementById('close-cal-btn').addEventListener('click', () => {
  calModal.classList.add('hidden');
});
document.getElementById('set-north-btn').addEventListener('click', () => {
  if (sensorManager) {
    sensorManager.calibrateCurrentAsNorth();
    alert('North calibrated!');
  }
});

document.getElementById('set-horizon-btn')?.addEventListener('click', () => {
  if (sensorManager) {
    sensorManager.calibrateCurrentAsHorizon();
    alert('Horizon calibrated!');
  }
});

// --- Muhurta ---
const muhurtaScreen = new MuhurtaScreen(
  document.getElementById('muhurta-screen'),
  () => showScreen('list')
);

document.getElementById('muhurta-btn').addEventListener('click', () => {
  if (appState.lat !== null) {
    muhurtaScreen.updateLocation(appState.lat, appState.lon);
  }
  showScreen('muhurta');
});

// --- Debug ---
document.getElementById('debug-toggle').addEventListener('click', () => {
  document.getElementById('debug-overlay').classList.toggle('hidden');
});
