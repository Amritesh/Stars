import './style.css';
import { getCelestialPositions, formatDeg } from './astronomy.js';

// --- Sensor Handling ---
class SensorManager {
  constructor(onUpdate) {
    this.onUpdate = onUpdate;
    this.heading = 0; // 0=North, 90=East
    this.pitch = 0;   // 0=Horizon, 90=Zenith
    this.calibrationOffset = parseFloat(localStorage.getItem('stars_north_offset') || '0');
    
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
    let pitch = 90 - beta;

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
  pointer: document.getElementById('pointer-screen')
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
    calModal.classList.add('hidden');
    alert('North calibrated!');
  }
});

// --- Debug ---
document.getElementById('debug-toggle').addEventListener('click', () => {
  document.getElementById('debug-overlay').classList.toggle('hidden');
});
