
// Android Alarm Intents

function isAndroid() {
  return /Android/i.test(navigator.userAgent);
}

export function getPlatformInfo() {
  if (isAndroid()) return "Android";
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) return "iOS";
  return "Desktop/Other";
}

export function openAndroidAlarm(hour, minute, title = "Muhurta") {
    // 1. Try with package (deskclock) - usually Google Clock
    // 2. Fallback to generic action
    // Note: We can't easily "try one then the other" because opening an intent navigates away.
    // We have to pick the best strategy.
    
    // Strategy:
    // Create an anchor tag with the intent URL.
    // intent://setalarm?hour=H&minutes=M&message=Title#Intent;scheme=android-app;package=com.google.android.deskclock;action=android.intent.action.SET_ALARM;end
    
    // Simpler generic intent that lets user choose app if multiple exist:
    // intent:#Intent;action=android.intent.action.SET_ALARM;i.hour=10;i.minutes=30;S.message=Title;end
    
    // Chrome on Android usually handles `intent:` scheme.
    
    if (!isAndroid()) return false;

    // Construct the Intent URI
    // Reference: https://developer.android.com/guide/components/intents-common#Clock
    // Action: android.intent.action.SET_ALARM
    // Extras: android.intent.extra.alarm.HOUR, android.intent.extra.alarm.MINUTES, android.intent.extra.alarm.MESSAGE
    
    const intentUri = `intent:#Intent;action=android.intent.action.SET_ALARM;i.hour=${hour};i.minutes=${minute};S.message=${encodeURIComponent(title)};end`;
    
    // We create a temporary link and click it.
    const link = document.createElement('a');
    link.href = intentUri;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    
    // We can't know if it succeeded, but we returned true to indicate we tried.
    // If it fails, the browser usually shows an error or does nothing.
    setTimeout(() => {
       document.body.removeChild(link); 
    }, 1000);
    
    return true;
}
