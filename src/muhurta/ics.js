
// ICS Generator

function formatDate(date) {
  // YYYYMMDDTHHMMSS
  // Use local time, but format as string.
  // Actually standard ICS usually wants UTC (Z) or "Floating" (Local).
  // Requirement: "Use local time with floating time (no Z) OR include timezone."
  // Floating is easiest for "Sunrise at 6AM regardless of where I am" but for actual absolute time events,
  // we usually want the specific time at that location.
  // Since we are adding to the user's calendar which is likely in the same timezone,
  // Floating (Local) is safest to match what the user sees on screen.
  
  const pad = (n) => n.toString().padStart(2, '0');
  const Y = date.getFullYear();
  const M = pad(date.getMonth() + 1);
  const D = pad(date.getDate());
  const h = pad(date.getHours());
  const m = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  return `${Y}${M}${D}T${h}${m}${s}`;
}

export function buildIcsEvents(events) {
  // events: [{ title, start, end, description, reminderMinutes }]
  
  let content = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Stars App//Muhurta//EN',
    'CALSCALE:GREGORIAN'
  ];

  events.forEach(ev => {
    const now = new Date();
    const dtStamp = formatDate(now) + 'Z'; // DTSTAMP is usually UTC
    const dtStart = formatDate(ev.start);
    const dtEnd = formatDate(ev.end);
    const uid = `${Date.now()}-${Math.random().toString(36).substr(2)}@starsapp`;

    content.push('BEGIN:VEVENT');
    content.push(`UID:${uid}`);
    content.push(`DTSTAMP:${dtStamp}`);
    content.push(`DTSTART:${dtStart}`);
    content.push(`DTEND:${dtEnd}`);
    content.push(`SUMMARY:${ev.title}`);
    if (ev.description) content.push(`DESCRIPTION:${ev.description}`);
    
    if (ev.reminderMinutes > 0) {
      content.push('BEGIN:VALARM');
      content.push('ACTION:DISPLAY');
      content.push('DESCRIPTION:Reminder');
      content.push(`TRIGGER:-PT${ev.reminderMinutes}M`);
      content.push('END:VALARM');
    }
    
    content.push('END:VEVENT');
  });

  content.push('END:VCALENDAR');
  return content.join('\r\n');
}

export function downloadIcs(filename, content) {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
