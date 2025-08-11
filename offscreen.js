// offscreen.js - ONLY plays audio. No UI here.
chrome.runtime.onMessage.addListener((message) => {
  if (!message || message.type !== 'PLAY_SOUND') return;
  const src = chrome.runtime.getURL(message.file || 'beep.mp3');
  const audio = new Audio(src);
  audio.play().catch(err => console.error('Audio play failed (offscreen):', err));
});
