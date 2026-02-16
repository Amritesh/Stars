import { computeMuhurta } from './suncalc.js';
import { buildIcsEvents, downloadIcs } from './ics.js';
import { openAndroidAlarm, getPlatformInfo } from './alarmLinks.js';

export class MuhurtaScreen {
  constructor(screenElement, onBack) {
    this.screen = screenElement;
    this.listContainer = screenElement.querySelector('#muhurta-list');
    this.dateDisplay = screenElement.querySelector('#current-date-display');
    this.onBack = onBack;
    
    this.currentDate = new Date();
    this.lat = null;
    this.lon = null;

    this.initListeners();
  }

  initListeners() {
    this.screen.querySelector('#muhurta-back-btn').addEventListener('click', () => {
      this.onBack();
    });

    this.screen.querySelector('#prev-day').addEventListener('click', () => {
      this.currentDate.setDate(this.currentDate.getDate() - 1);
      this.render();
    });

    this.screen.querySelector('#next-day').addEventListener('click', () => {
      this.currentDate.setDate(this.currentDate.getDate() + 1);
      this.render();
    });
  }

  updateLocation(lat, lon) {
    this.lat = lat;
    this.lon = lon;
    this.render();
  }

  formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  render() {
    if (this.lat === null) {
      this.listContainer.innerHTML = '<div class="doodle-box">Waiting for location...</div>';
      return;
    }

    // Update Date Display
    const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
    this.dateDisplay.textContent = this.currentDate.toLocaleDateString(undefined, options);

    // Compute Muhurta
    const timings = computeMuhurta(this.currentDate, this.lat, this.lon);

    if (timings.error) {
      this.listContainer.innerHTML = `<div class="doodle-box error">${timings.error}</div>`;
      return;
    }

    this.listContainer.innerHTML = '';
    
    // Add Diagnostics
    const diag = document.createElement('div');
    diag.className = 'diagnostics';
    diag.innerHTML = `<small>Lat: ${this.lat.toFixed(2)}, Lon: ${this.lon.toFixed(2)} | ${timings.timezone} | ${getPlatformInfo()}</small>`;
    this.listContainer.appendChild(diag);

    // Render Cards
    this.renderCard("Sunrise", "🌅", timings.sunrise, null);
    this.renderCard("Sunset", "🌇", timings.sunset, null);
    
    this.renderRangeCard("Brahma Muhurta", "🧘", timings.brahma.start, timings.brahma.end);
    this.renderRangeCard("Pratah Sandhya", "🙏", timings.pratahSandhya.start, timings.pratahSandhya.end);
    this.renderRangeCard("Sayam Sandhya", "🕯️", timings.sayamSandhya.start, timings.sayamSandhya.end);
  }

  renderCard(title, icon, time, endTime) {
    const card = document.createElement('div');
    card.className = 'muhurta-card doodle-box';
    
    const timeStr = this.formatTime(time);
    
    // Create Actions
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'muhurta-actions';

    // Alarm Button (Android only)
    const alarmBtn = document.createElement('button');
    alarmBtn.className = 'small-btn action-btn';
    alarmBtn.innerHTML = '⏰';
    alarmBtn.title = "Set Alarm";
    // Always enable but show visual hint and alert if it fails
    if (getPlatformInfo() !== "Android") {
      alarmBtn.classList.add('not-android');
      alarmBtn.title = "Best on Android; on other devices use Calendar";
    }
    
    alarmBtn.addEventListener('click', () => {
        const success = openAndroidAlarm(time.getHours(), time.getMinutes(), title);
        if (!success) {
            alert("Alarm auto-set is only supported on Android with Google Clock. Please use 'Add to Calendar' for other devices.");
        }
    });

    // Add to Calendar Button
    const addBtn = document.createElement('button');
    addBtn.className = 'small-btn action-btn';
    addBtn.innerHTML = '📅';
    addBtn.title = "Add to Calendar";
    addBtn.addEventListener('click', () => {
        this.openCalendarModal(title, time, endTime); 
    });

    actionsDiv.appendChild(alarmBtn);
    actionsDiv.appendChild(addBtn);

    card.innerHTML = `
      <div class="muhurta-info">
        <span class="muhurta-icon">${icon}</span>
        <div class="muhurta-text">
            <div class="muhurta-title">${title}</div>
            <div class="muhurta-time">${timeStr}</div>
        </div>
      </div>
    `;
    card.appendChild(actionsDiv);
    this.listContainer.appendChild(card);
  }

  renderRangeCard(title, icon, start, end) {
      const card = document.createElement('div');
      card.className = 'muhurta-card doodle-box';
      
      const startStr = this.formatTime(start);
      const endStr = this.formatTime(end);

      // Actions for Start Time
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'muhurta-actions';

      const alarmBtn = document.createElement('button');
      alarmBtn.className = 'small-btn action-btn';
      alarmBtn.innerHTML = '⏰';
      if (getPlatformInfo() !== "Android") {
          alarmBtn.classList.add('not-android');
      }
      
      alarmBtn.addEventListener('click', () => {
          const success = openAndroidAlarm(start.getHours(), start.getMinutes(), title);
          if (!success) {
              alert("Alarm auto-set is only supported on Android with Google Clock. Please use 'Add to Calendar' for other devices.");
          }
      });

      const addBtn = document.createElement('button');
      addBtn.className = 'small-btn action-btn';
      addBtn.innerHTML = '📅';
      addBtn.addEventListener('click', () => {
          this.openCalendarModal(title, start, end);
      });

      actionsDiv.appendChild(alarmBtn);
      actionsDiv.appendChild(addBtn);

      card.innerHTML = `
        <div class="muhurta-info">
            <span class="muhurta-icon">${icon}</span>
            <div class="muhurta-text">
                <div class="muhurta-title">${title}</div>
                <div class="muhurta-time">${startStr} – ${endStr}</div>
            </div>
        </div>
      `;
      card.appendChild(actionsDiv);
      this.listContainer.appendChild(card);
  }
  
  openCalendarModal(title, start, end) {
      let modal = document.getElementById('muhurta-modal');
      
      // If modal doesn't exist in DOM, create it.
      // But checking simply by ID might fail if I haven't appended it yet.
      // So let's build it if missing.
      
      if (!modal) {
          modal = document.createElement('div');
          modal.id = 'muhurta-modal';
          modal.className = 'modal hidden';
          modal.innerHTML = `
            <div class="modal-content doodle-box">
                <h3>Add to Calendar</h3>
                <p id="cal-event-title" style="font-weight:bold;"></p>
                <div class="cal-options" style="text-align:left; margin: 10px 0;">
                    <label>Duration: 
                        <select id="cal-days">
                            <option value="1">Just Today</option>
                            <option value="7">7 Days</option>
                            <option value="30">30 Days</option>
                            <option value="90">90 Days</option>
                        </select>
                    </label>
                    <br><br>
                    <label>Reminder: 
                        <select id="cal-reminder">
                            <option value="0">None</option>
                            <option value="5">5 min before</option>
                            <option value="15">15 min before</option>
                        </select>
                    </label>
                </div>
                <div class="modal-actions" style="margin-top:15px;">
                    <button id="cal-add-btn" class="doodle-btn">Download ICS</button>
                    <button id="cal-cancel-btn" class="doodle-btn secondary">Cancel</button>
                </div>
            </div>
          `;
          document.body.appendChild(modal);
          
          document.getElementById('cal-cancel-btn').addEventListener('click', () => {
              modal.classList.add('hidden');
          });
      }
      
      const titleEl = document.getElementById('cal-event-title');
      titleEl.textContent = title;
      
      const addBtn = document.getElementById('cal-add-btn');
      
      // Clone to clear previous listeners
      const newBtn = addBtn.cloneNode(true);
      addBtn.parentNode.replaceChild(newBtn, addBtn);
      
      newBtn.addEventListener('click', () => {
          const daysSelect = document.getElementById('cal-days');
          const days = parseInt(daysSelect.value);
          const reminderSelect = document.getElementById('cal-reminder');
          const reminder = parseInt(reminderSelect.value);
          
          this.generateCalendarFile(title, start, end, days, reminder);
          modal.classList.add('hidden');
      });
      
      modal.classList.remove('hidden');
  }

  generateCalendarFile(title, start, end, days, reminder) {
      const events = [];
      
      // We start from the currently selected date in the UI
      const baseDate = new Date(this.currentDate);
      
      for (let i = 0; i < days; i++) {
          const d = new Date(baseDate);
          d.setDate(d.getDate() + i);
          
          const timings = computeMuhurta(d, this.lat, this.lon);
          if (timings.error) continue;
          
          let sTime, eTime;
          
          if (title === "Sunrise") { sTime = timings.sunrise; eTime = new Date(sTime.getTime() + 10*60000); }
          else if (title === "Sunset") { sTime = timings.sunset; eTime = new Date(sTime.getTime() + 10*60000); }
          else if (title === "Brahma Muhurta") { sTime = timings.brahma.start; eTime = timings.brahma.end; }
          else if (title === "Pratah Sandhya") { sTime = timings.pratahSandhya.start; eTime = timings.pratahSandhya.end; }
          else if (title === "Sayam Sandhya") { sTime = timings.sayamSandhya.start; eTime = timings.sayamSandhya.end; }
          
          if (sTime && eTime) {
              events.push({
                  title: `${title} - Stars App`,
                  start: sTime,
                  end: eTime,
                  reminderMinutes: reminder,
                  description: `Calculated for Lat: ${this.lat.toFixed(2)}, Lon: ${this.lon.toFixed(2)}`
              });
          }
      }
      
      const icsContent = buildIcsEvents(events);
      downloadIcs(`muhurta-${title.replace(/\s+/g, '-')}.ics`, icsContent);
  }
}
