// popup.js
const elInterval = document.getElementById('interval');
const elSound = document.getElementById('sound');
const btnStart = document.getElementById('start');
const btnStop = document.getElementById('stop');
const elStatus = document.getElementById('status');
const elNext = document.getElementById('next');
const jokeEl = document.getElementById('joke');
const jokeBtn = document.getElementById('jokeBtn');

let countdownTimer = null;

function setRunningUI() {
  elStatus.textContent = 'Timer running';
  elInterval.disabled = true;
  elSound.disabled = true;
  btnStart.disabled = true;
  btnStop.disabled = false;
}

function setStoppedUI() {
  elStatus.textContent = 'Timer stopped';
  elInterval.disabled = false;
  elSound.disabled = false;
  btnStart.disabled = false;
  btnStop.disabled = true;
  elNext.textContent = 'Next in: --:--';
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
}

btnStart.addEventListener('click', () => {
  const interval = Number(elInterval.value) || 20;
  const sound = elSound.value || 'beep.mp3';

  // persist selection
  chrome.storage.local.set({ selectedSound: sound }, () => {
    // tell background to start alarm (no callback)
    chrome.runtime.sendMessage({ type: 'START_TIMER', interval });
    // ask background to show immediate reminder (no callback)
    //chrome.runtime.sendMessage({ type: 'SHOW_REMINDER_NOW' });
  });

  setRunningUI();
});

btnStop.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'STOP_TIMER' });
  setStoppedUI();
});

jokeBtn.addEventListener('click', async () => {
  jokeEl.textContent = 'Fetching a dad joke…';
  try {
    const res = await fetch('https://icanhazdadjoke.com/', {
      headers: { Accept: 'application/json' }
    });
    if (!res.ok) throw new Error('Network error');
    const data = await res.json();
    const j = data && data.joke ? data.joke : null;
    if (j) {
      jokeEl.textContent = j;
      chrome.storage.local.set({ lastDadJoke: j });
    } else {
      jokeEl.textContent = "Couldn't fetch a joke — try again.";
    }
  } catch (err) {
    console.warn('joke fetch failed', err);
    jokeEl.textContent = "Couldn't fetch a joke — check network.";
  }
});

// listen for countdown updates from background (keeps your UI synced)
chrome.runtime.onMessage.addListener((message) => {
  if (!message || !message.type) return;
  if (message.type === 'COUNTDOWN_UPDATE') {
    const s = Number(message.secondsLeft) || 0;
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    elNext.textContent = `Next in: ${mm}:${ss}`;
    setRunningUI();
  } else if (message.type === 'TIMER_STOPPED') {
    setStoppedUI();
  } else if (message.type === 'SNOOZED') {
    elStatus.textContent = `Snoozed ${message.snoozeMinutes}m`;
  }
});

// load saved selection and last joke
chrome.storage.local.get(['selectedSound', 'interval', 'lastDadJoke'], (data) => {
  if (data.selectedSound) elSound.value = data.selectedSound;
  if (data.interval) elInterval.value = data.interval;
  if (data.lastDadJoke) jokeEl.textContent = data.lastDadJoke;
  btnStop.disabled = true;
});
