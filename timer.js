// Pure timer logic. No DOM, no clocks: every function takes `now` in ms.
// Loaded as a plain script in the browser and via require() in tests.
(function (root) {
  'use strict';

  var MIN = 60 * 1000;

  function length(mode, settings) {
    return settings[mode] * MIN;
  }

  function create(settings, day) {
    return {
      mode: 'focus',
      running: false,
      endAt: null,
      remainingMs: length('focus', settings),
      completed: 0,
      day: day || null
    };
  }

  function remaining(state, now) {
    if (!state.running) return state.remainingMs;
    return Math.max(0, state.endAt - now);
  }

  function progress(state, settings, now) {
    return remaining(state, now) / length(state.mode, settings);
  }

  function start(state, now) {
    if (state.running) return state;
    return Object.assign({}, state, {
      running: true,
      endAt: now + state.remainingMs
    });
  }

  function pause(state, now) {
    if (!state.running) return state;
    return Object.assign({}, state, {
      running: false,
      endAt: null,
      remainingMs: remaining(state, now)
    });
  }

  function setMode(state, mode, settings) {
    return Object.assign({}, state, {
      mode: mode,
      running: false,
      endAt: null,
      remainingMs: length(mode, settings)
    });
  }

  function reset(state, settings) {
    return setMode(state, state.mode, settings);
  }

  function next(state, settings) {
    if (state.mode !== 'focus') return setMode(state, 'focus', settings);
    var completed = state.completed + 1;
    var mode = completed % settings.cycle === 0 ? 'long' : 'short';
    return Object.assign(setMode(state, mode, settings), { completed: completed });
  }

  // Advances the clock. Returns { state, finished }. The caller decides how
  // to announce a finished session; the state has already moved on.
  function tick(state, now, settings) {
    if (!state.running || remaining(state, now) > 0) {
      return { state: state, finished: false };
    }
    return { state: next(state, settings || DEFAULTS), finished: true };
  }

  function format(ms) {
    var totalSeconds = Math.ceil(ms / 1000);
    var m = Math.floor(totalSeconds / 60);
    var s = totalSeconds % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function forDay(state, day) {
    if (state.day === day) return state;
    return Object.assign({}, state, { day: day, completed: 0 });
  }

  var DEFAULTS = { focus: 25, short: 5, long: 15, cycle: 4 };

  var Timer = {
    DEFAULTS: DEFAULTS,
    create: create,
    remaining: remaining,
    progress: progress,
    start: start,
    pause: pause,
    setMode: setMode,
    reset: reset,
    tick: tick,
    format: format,
    forDay: forDay
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Timer;
  else root.Timer = Timer;
})(typeof globalThis !== 'undefined' ? globalThis : this);
