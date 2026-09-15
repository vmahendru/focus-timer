(function () {
  'use strict';

  var SETTINGS_KEY = 'focus.settings';
  var STATE_KEY = 'focus.state';
  var TASK_KEY = 'focus.task';
  var THEME_KEY = 'focus.theme';
  var APP_VERSION = '7';

  var $ = function (sel) { return document.querySelector(sel); };
  var body = document.body;
  var levelEl = $('#level');
  var clockEl = $('#clock');
  var sessionsEl = $('#sessions');
  var taskEl = $('#task');
  var toggleEl = $('#toggle');
  var resetEl = $('#reset');
  var modeButtons = Array.prototype.slice.call(document.querySelectorAll('.modes button'));
  var sheet = $('#sheet');
  var backdrop = $('#sheet-backdrop');
  var settingsButton = $('#settings-button');
  var form = $('#settings-form');
  var notifyBox = $('#notify');
  var notifyHint = $('#notify-hint');
  var themeButtons = Array.prototype.slice.call(document.querySelectorAll('.themes button'));
  var themeColor = document.querySelector('meta[name="theme-color"]');

  // ----- persistence -----

  function load(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ }
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  var settings = Object.assign({ sound: true, notify: false }, Timer.DEFAULTS, load(SETTINGS_KEY, {}));
  var state = Timer.forDay(load(STATE_KEY, Timer.create(settings, today())), today());

  function commit(next) {
    state = next;
    save(STATE_KEY, state);
    render();
  }

  // ----- rendering -----

  var lastText = '';

  function render() {
    var now = Date.now();
    var ms = Timer.remaining(state, now);
    var text = Timer.format(ms);
    if (text !== lastText) {
      clockEl.textContent = text;
      lastText = text;
    }
    document.title = state.running ? text + ' · Focus' : 'Focus';

    levelEl.style.setProperty('--progress', Timer.progress(state, settings, now).toFixed(4));
    body.dataset.mode = state.mode;
    body.classList.toggle('break', state.mode !== 'focus');
    syncThemeColor();
    body.classList.toggle('paused', !state.running && ms < settings[state.mode] * 60000);
    toggleEl.textContent = state.running ? 'Pause' : (ms === 0 ? 'Start' : (ms < settings[state.mode] * 60000 ? 'Resume' : 'Start'));

    modeButtons.forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode));
    });

    renderSessions();
  }

  var lastSessionsKey = '';

  function renderSessions() {
    var key = state.completed + '/' + settings.cycle;
    if (key === lastSessionsKey) return;
    lastSessionsKey = key;
    sessionsEl.innerHTML = '';
    var full = Math.floor(state.completed / settings.cycle);
    var inCycle = state.completed % settings.cycle;
    // Show the current cycle; past full cycles collapse to a count.
    if (full > 0 && inCycle === 0 && state.mode !== 'focus') {
      full -= 1;
      inCycle = settings.cycle;
    }
    if (full > 0) {
      var extra = document.createElement('i');
      extra.className = 'extra';
      extra.textContent = full * settings.cycle + ' +';
      sessionsEl.appendChild(extra);
    }
    for (var i = 0; i < settings.cycle; i++) {
      var dot = document.createElement('i');
      if (i < inCycle) dot.className = 'done';
      sessionsEl.appendChild(dot);
    }
  }

  // ----- clock loop -----

  var interval = null;

  function startLoop() {
    stopLoop();
    interval = setInterval(step, 250);
  }

  function stopLoop() {
    if (interval) clearInterval(interval);
    interval = null;
  }

  function step() {
    var r = Timer.tick(state, Date.now(), settings);
    if (r.finished) {
      var finishedMode = state.mode;
      commit(r.state);
      stopLoop();
      announce(finishedMode);
    } else {
      render();
    }
  }

  // ----- finishing a session -----

  function announce(mode) {
    var title = mode === 'focus' ? 'Focus session done' : 'Break over';
    var bodyText = mode === 'focus'
      ? (state.mode === 'long' ? 'Take a long break.' : 'Take a short break.')
      : 'Back to: ' + (taskEl.value.trim() || 'your one thing');
    if (settings.sound) chime();
    if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
    if (settings.notify && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        new Notification(title, { body: bodyText, tag: 'focus-timer', silent: true });
      } catch (e) {
        if (navigator.serviceWorker && navigator.serviceWorker.ready) {
          navigator.serviceWorker.ready.then(function (reg) {
            reg.showNotification(title, { body: bodyText, tag: 'focus-timer' });
          });
        }
      }
    }
  }

  var audio = null;

  function unlockAudio() {
    if (!settings.sound) return;
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!audio) audio = new Ctx();
    if (audio.state === 'suspended') audio.resume();
  }

  function chime() {
    if (!audio) return;
    var t = audio.currentTime;
    [[659, 0], [880, 0.18], [1319, 0.36]].forEach(function (note) {
      var osc = audio.createOscillator();
      var gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value = note[0];
      gain.gain.setValueAtTime(0.0001, t + note[1]);
      gain.gain.exponentialRampToValueAtTime(0.25, t + note[1] + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + note[1] + 0.7);
      osc.connect(gain).connect(audio.destination);
      osc.start(t + note[1]);
      osc.stop(t + note[1] + 0.75);
    });
  }

  // ----- controls -----

  function toggle() {
    unlockAudio();
    if (state.running) {
      commit(Timer.pause(state, Date.now()));
      stopLoop();
    } else {
      commit(Timer.start(state, Date.now()));
      startLoop();
    }
  }

  function reset() {
    commit(Timer.reset(state, settings));
    stopLoop();
  }

  function setMode(mode) {
    commit(Timer.setMode(state, mode, settings));
    stopLoop();
  }

  toggleEl.addEventListener('click', toggle);
  resetEl.addEventListener('click', reset);
  modeButtons.forEach(function (b) {
    b.addEventListener('click', function () { setMode(b.dataset.mode); });
  });

  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!sheet.hidden) {
      if (e.key === 'Escape') closeSheet();
      return;
    }
    var typing = document.activeElement === taskEl;
    if (typing) {
      if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); taskEl.blur(); }
      return;
    }
    if (e.key === ' ') { e.preventDefault(); toggle(); }
    else if (e.key === 'r' || e.key === 'R') reset();
    else if (e.key === '1') setMode('focus');
    else if (e.key === '2') setMode('short');
    else if (e.key === '3') setMode('long');
    else if (e.key === 't' || e.key === 'T') { e.preventDefault(); taskEl.focus(); taskEl.select(); }
  });

  // ----- task -----

  function fitTask() {
    taskEl.style.height = 'auto';
    taskEl.style.height = taskEl.scrollHeight + 'px';
  }

  taskEl.value = load(TASK_KEY, '');
  taskEl.addEventListener('input', function () {
    fitTask();
    save(TASK_KEY, taskEl.value);
  });
  taskEl.addEventListener('blur', function () {
    taskEl.value = taskEl.value.trim();
    save(TASK_KEY, taskEl.value);
    fitTask();
  });
  window.addEventListener('resize', fitTask);

  // ----- colour scheme -----

  var THEMES = ['spirit', 'mono', 'rainier', 'gate', 'summer', 'rockies', 'texas',
    'foliage', 'empire', 'sunshine', 'windy', 'aloha', 'frontier'];
  var DEFAULT_THEME = 'spirit';
  // Names from before the scenes, so a saved choice carries over.
  var RENAMED = { 'old-glory': 'spirit', pnw: 'rainier', norcal: 'gate', socal: 'summer', 'new-england': 'foliage',
    'new-york': 'empire', florida: 'sunshine', chicago: 'windy', hawaii: 'aloha', alaska: 'frontier' };

  function applyTheme(name) {
    name = RENAMED[name] || name;
    if (THEMES.indexOf(name) === -1) name = DEFAULT_THEME;
    body.dataset.theme = name;
    themeButtons.forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.theme === name));
    });
    save(THEME_KEY, name);
    syncThemeColor();
  }

  function syncThemeColor() {
    var bg = getComputedStyle(body).backgroundColor;
    if (bg && themeColor.content !== bg) themeColor.content = bg;
  }

  themeButtons.forEach(function (b) {
    b.addEventListener('click', function () { applyTheme(b.dataset.theme); });
  });

  applyTheme(load(THEME_KEY, DEFAULT_THEME));

  // ----- settings sheet -----

  function openSheet() {
    form.focus.value = settings.focus;
    form.short.value = settings.short;
    form.long.value = settings.long;
    form.cycle.value = settings.cycle;
    form.sound.checked = settings.sound;
    notifyBox.checked = settings.notify && notificationsGranted();
    updateNotifyHint();
    sheet.hidden = false;
    backdrop.hidden = false;
    settingsButton.setAttribute('aria-expanded', 'true');
    sheet.scrollTop = 0;
    sheet.focus();
  }

  function closeSheet() {
    sheet.hidden = true;
    backdrop.hidden = true;
    settingsButton.setAttribute('aria-expanded', 'false');
    settingsButton.focus();
  }

  function notificationsGranted() {
    return typeof Notification !== 'undefined' && Notification.permission === 'granted';
  }

  function updateNotifyHint() {
    var standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    var isApple = /iPhone|iPad|iPod/.test(navigator.userAgent);
    if (typeof Notification === 'undefined') {
      notifyHint.textContent = isApple && !standalone
        ? 'On iPhone, notifications only work after you add Focus to your Home Screen.'
        : 'This browser does not support notifications.';
      notifyHint.hidden = false;
      notifyBox.disabled = true;
    } else if (Notification.permission === 'denied') {
      notifyHint.textContent = 'Notifications are blocked for this site. Allow them in your browser settings to turn this on.';
      notifyHint.hidden = false;
      notifyBox.disabled = true;
    } else {
      notifyHint.hidden = true;
      notifyBox.disabled = false;
    }
  }

  notifyBox.addEventListener('change', function () {
    if (notifyBox.checked && !notificationsGranted()) {
      Notification.requestPermission().then(function (p) {
        notifyBox.checked = p === 'granted';
        updateNotifyHint();
      });
    }
  });

  settingsButton.addEventListener('click', openSheet);
  $('#sheet-close').addEventListener('click', closeSheet);
  backdrop.addEventListener('click', closeSheet);

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var next = {
      focus: clamp(form.focus.valueAsNumber, 1, 180, Timer.DEFAULTS.focus),
      short: clamp(form.short.valueAsNumber, 1, 60, Timer.DEFAULTS.short),
      long: clamp(form.long.valueAsNumber, 1, 120, Timer.DEFAULTS.long),
      cycle: clamp(form.cycle.valueAsNumber, 1, 12, Timer.DEFAULTS.cycle),
      sound: form.sound.checked,
      notify: notifyBox.checked && notificationsGranted()
    };
    var lengthsChanged = ['focus', 'short', 'long'].some(function (k) { return next[k] !== settings[k]; });
    settings = next;
    save(SETTINGS_KEY, settings);
    lastSessionsKey = '';
    if (lengthsChanged && !state.running) commit(Timer.reset(state, settings));
    else render();
    closeSheet();
  });

  function clamp(n, lo, hi, fallback) {
    if (isNaN(n)) return fallback;
    return Math.min(hi, Math.max(lo, Math.round(n)));
  }

  // ----- lifecycle -----

  // iOS suspends timers in the background; recompute from the wall clock
  // whenever the page becomes visible again.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      commit(Timer.forDay(state, today()));
      if (state.running) step();
    }
  });

  $('#version').textContent = 'Version ' + APP_VERSION;

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    var registration = null;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js')
        .then(function (reg) { registration = reg; })
        .catch(function () { /* offline install is optional */ });
    });
    // Look for a newer version each time the app comes to the front.
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && registration) registration.update();
    });
    // When a newer version takes over, reload once so it shows straight away.
    // Only when there was an old controller: a first install never reloads.
    var hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (hadController && !state.running) location.reload();
      hadController = true;
    });
  }

  // Browsers only allow sound after a user gesture, so if the page opens
  // mid-session, arm the chime on the first tap or key press.
  function unlockOnGesture() {
    unlockAudio();
    document.removeEventListener('pointerdown', unlockOnGesture);
    document.removeEventListener('keydown', unlockOnGesture);
  }

  fitTask();
  render();
  if (state.running) {
    document.addEventListener('pointerdown', unlockOnGesture);
    document.addEventListener('keydown', unlockOnGesture);
    step();
    if (state.running) startLoop();
  }
})();
