// background.js
// Safe send helper (avoids "Receiving end does not exist" promise rejections)
function safeSend(message) {
  try {
    chrome.runtime.sendMessage(message, () => {
      if (chrome.runtime.lastError) {
        // swallow errors
      }
    });
  } catch (e) {
    console.warn('safeSend threw:', e);
  }
}

let alarmSet = false;
let intervalMinutes = 0;
let nextAlarmTime = 0;
let countdownTicker = null;

// ensure offscreen exists
async function setupOffscreen() {
  const exists = await chrome.offscreen.hasDocument();
  if (!exists) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Play reminder sound'
    });
    await new Promise(r => setTimeout(r, 250));
  }
}

function setIcon(isActive) {
  chrome.action.setIcon({
    path: isActive
      ? { 16: 'icon16_green.png', 48: 'icon48_green.png', 128: 'icon128_green.png' }
      : { 16: 'icon16_gray.png', 48: 'icon48_gray.png', 128: 'icon128_gray.png' }
  });
}

// Start background countdown ticker that sends seconds left to popup(s)
function startCountdownTicker() {
  if (countdownTicker) clearInterval(countdownTicker);
  countdownTicker = setInterval(() => {
    if (!nextAlarmTime) return;
    const secondsLeft = Math.max(0, Math.floor((nextAlarmTime - Date.now()) / 1000));
    safeSend({ type: 'COUNTDOWN_UPDATE', secondsLeft });
    if (secondsLeft <= 0) {
      clearInterval(countdownTicker);
      countdownTicker = null;
    }
  }, 1000);
}
function stopCountdownTicker() {
  if (countdownTicker) clearInterval(countdownTicker);
  countdownTicker = null;
}

// Fetch a dad joke from icanhazdadjoke.com and store it
async function fetchJoke() {
  try {
    const res = await fetch('https://icanhazdadjoke.com/', {
      headers: { Accept: 'application/json' }
    });
    if (!res.ok) throw new Error('Network response not ok');
    const data = await res.json();
    const joke = data && data.joke ? data.joke : null;
    if (joke) {
      chrome.storage.local.set({ lastDadJoke: joke });
    }
    return joke;
  } catch (err) {
    console.error('fetchJoke failed', err);
    return null;
  }
}

// Show reminder: play sound (via offscreen), show notification with joke, open countdown popup
async function showReminderNow() {
  // play sound (respect selectedSound)
  chrome.storage.local.get('selectedSound', async (data) => {
    const soundFile = data.selectedSound || 'beep.mp3';
    await setupOffscreen();
    safeSend({ type: 'PLAY_SOUND', file: soundFile });
  });

  // fetch a joke and show notification
  const joke = await fetchJoke() || 'Time for a quick 20s eye break!';
  try {
    chrome.notifications.create('', {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icon16_green.png'),
      title: 'Look 20 feet away 👀',
      message: joke,
      priority: 2
    }, () => {});
  } catch (e) {
    // ignore notification errors
  }

  // open countdown popup window (the 20s visual)
  try {
    chrome.windows.create({
      url: chrome.runtime.getURL('countdown.html'),
      type: 'popup',
      width: 320,
      height: 260
    }, () => {});
  } catch (e) { /* ignore */ }

  // Reset next alarm time & restart local ticker
  if (intervalMinutes && intervalMinutes > 0) {
    nextAlarmTime = Date.now() + intervalMinutes * 60 * 1000;
    startCountdownTicker();
  } else {
    nextAlarmTime = 0;
    stopCountdownTicker();
  }
}

// handle messages from popup / countdown popup
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  if (message.type === 'START_TIMER') {
    if (!alarmSet) {
      intervalMinutes = Number(message.interval) || 20;
      await setupOffscreen();
      chrome.alarms.create('beepAlarm', { delayInMinutes: intervalMinutes, periodInMinutes: intervalMinutes });
      nextAlarmTime = Date.now() + intervalMinutes * 60 * 1000;
      alarmSet = true;
      setIcon(true);
      startCountdownTicker();
    }
    // respond OK
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'STOP_TIMER') {
    chrome.alarms.clear('beepAlarm');
    alarmSet = false;
    nextAlarmTime = 0;
    setIcon(false);
    stopCountdownTicker();
    safeSend({ type: 'TIMER_STOPPED' });
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'SNOOZE') {
    const snooze = Number(message.snoozeMinutes) || 5;
    chrome.alarms.clear('beepAlarm', () => {
      chrome.alarms.create('beepAlarm', { delayInMinutes: snooze, periodInMinutes: intervalMinutes });
      nextAlarmTime = Date.now() + snooze * 60 * 1000;
      alarmSet = true;
      setIcon(true);
      startCountdownTicker();
      safeSend({ type: 'SNOOZED', snoozeMinutes: snooze });
      sendResponse({ ok: true, snoozeMinutes: snooze });
    });
    return true;
  }

  // new: ask background to show reminder immediately (play sound, notify, open countdown)
  if (message.type === 'SHOW_REMINDER_NOW') {
    await showReminderNow();
    sendResponse({ ok: true });
    return true;
  }

  // new: popup asks to fetch a fresh joke (but not show notification)
  if (message.type === 'FETCH_JOKE') {
    const j = await fetchJoke();
    sendResponse({ joke: j || null });
    return true;
  }

  // new: popup asks for last stored joke
  if (message.type === 'GET_LAST_JOKE') {
    chrome.storage.local.get('lastDadJoke', (res) => {
      sendResponse({ joke: res && res.lastDadJoke ? res.lastDadJoke : null });
    });
    return true;
  }

  return false;
});

// Alarm fired
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== 'beepAlarm') return;

  // When the periodic alarm fires, show the reminder now (which fetches a joke too)
  showReminderNow();
});
