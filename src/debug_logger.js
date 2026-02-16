// Debug Logger for Sensor Data
export class DebugLogger {
    constructor() {
        this.logElement = document.getElementById('debug-log');
        if (!this.logElement) {
            // Create debug overlay if it doesn't exist
            const overlay = document.createElement('div');
            overlay.id = 'debug-overlay';
            overlay.style.position = 'fixed';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.width = '100%';
            overlay.style.height = '100px';
            overlay.style.background = 'rgba(0,0,0,0.7)';
            overlay.style.color = '#0f0';
            overlay.style.fontSize = '12px';
            overlay.style.fontFamily = 'monospace';
            overlay.style.zIndex = '9999';
            overlay.style.pointerEvents = 'none';
            overlay.style.whiteSpace = 'pre-wrap';
            overlay.style.padding = '5px';
            document.body.appendChild(overlay);
            this.logElement = overlay;
        }
    }

    log(data) {
        if (!this.logElement) return;
        const { beta, pitch, rawPitch } = data;
        this.logElement.textContent = `Beta: ${beta?.toFixed(1)} | Pitch: ${pitch?.toFixed(1)} | RawPitch: ${rawPitch?.toFixed(1)}`;
    }
}
