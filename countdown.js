(() => {
  let seconds = 20;
  const timerEl = document.getElementById('timer');
  const jokeEl = document.getElementById('joke');
  const closeBtn = document.getElementById('closeBtn');

  // Try storage first; if not available, fetch directly as fallback.
  function showFallbackIfNeeded() {
    chrome.storage.local.get('lastDadJoke', (res) => {
      if (res && res.lastDadJoke) {
        jokeEl.textContent = res.lastDadJoke;
      } else {
        // fallback: fetch a joke directly (host_permissions required in manifest)
        fetch('https://icanhazdadjoke.com/', { headers: { Accept: 'application/json' } })
          .then(r => {
            if (!r.ok) throw new Error('Network');
            return r.json();
          })
          .then(d => {
            if (d && d.joke) {
              jokeEl.textContent = d.joke;
              chrome.storage.local.set({ lastDadJoke: d.joke });
            } else {
              jokeEl.textContent = "(no joke available)";
            }
          })
          .catch((e) => {
            console.warn('fallback joke fetch failed', e);
            jokeEl.textContent = "(no joke available)";
          });
      }
    });
  }

  showFallbackIfNeeded();

  // Countdown display
  const tick = () => {
    timerEl.textContent = seconds;
    if (seconds <= 0) {
      clearInterval(intervalId);
      setTimeout(() => window.close(), 700);
    }
    seconds--;
  };

  const intervalId = setInterval(tick, 1000);
  tick();

  closeBtn.addEventListener('click', () => window.close());
})();
