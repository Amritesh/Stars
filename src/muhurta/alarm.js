// src/muhurta/alarm.js

/**
 * Creates an Android Intent URL for setting an alarm/timer.
 * Note: Web Intents only work on Android Chrome.
 * 
 * Helper for 'intent:' syntax.
 */

export function setAndroidAlarm(hour, minute, message) {
    // Intent to set an alarm
    // action: android.intent.action.SET_ALARM
    // extras:
    //  android.intent.extra.alarm.HOUR (int)
    //  android.intent.extra.alarm.MINUTES (int)
    //  android.intent.extra.alarm.MESSAGE (string)
    //  android.intent.extra.alarm.SKIP_UI (boolean)
    
    // Construct the intent URL
    const intentUrl = `intent:#Intent;action=android.intent.action.SET_ALARM;i.android.intent.extra.alarm.HOUR=${hour};i.android.intent.extra.alarm.MINUTES=${minute};S.android.intent.extra.alarm.MESSAGE=${encodeURIComponent(message)};B.android.intent.extra.alarm.SKIP_UI=false;end`;
    
    // Try to open
    window.location.href = intentUrl;
}

export function setAndroidTimer(seconds, message) {
    // action: android.intent.action.SET_TIMER
    // extras:
    //  android.intent.extra.alarm.LENGTH (int) - seconds
    //  android.intent.extra.alarm.MESSAGE (string)
    //  android.intent.extra.alarm.SKIP_UI (boolean)

    const intentUrl = `intent:#Intent;action=android.intent.action.SET_TIMER;i.android.intent.extra.alarm.LENGTH=${seconds};S.android.intent.extra.alarm.MESSAGE=${encodeURIComponent(message)};B.android.intent.extra.alarm.SKIP_UI=false;end`;
    
    window.location.href = intentUrl;
}

export function openCalendarEvent(title, description, startTime, endTime) {
    // Intent to insert event
    // action: android.intent.action.INSERT
    // data: content://com.android.calendar/events
    // extras:
    //  beginTime (long)
    //  endTime (long)
    //  title
    //  description
    
    const start = startTime.getTime();
    const end = endTime.getTime();
    
    const intentUrl = `intent:#Intent;action=android.intent.action.INSERT;data=content://com.android.calendar/events;l.beginTime=${start};l.endTime=${end};S.title=${encodeURIComponent(title)};S.description=${encodeURIComponent(description)};end`;
    
    window.location.href = intentUrl;
}
