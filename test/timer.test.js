const test = require('node:test');
const assert = require('node:assert/strict');
const Timer = require('../timer.js');

const settings = { focus: 25, short: 5, long: 15, cycle: 4 };
const MIN = 60 * 1000;

test('fresh state is a paused focus session at full length', () => {
  const s = Timer.create(settings);
  assert.equal(s.mode, 'focus');
  assert.equal(s.running, false);
  assert.equal(Timer.remaining(s, 0), 25 * MIN);
  assert.equal(s.completed, 0);
});

test('start sets an end time and remaining counts down', () => {
  let s = Timer.create(settings);
  s = Timer.start(s, 1000);
  assert.equal(s.running, true);
  assert.equal(Timer.remaining(s, 1000), 25 * MIN);
  assert.equal(Timer.remaining(s, 1000 + 10 * MIN), 15 * MIN);
});

test('pause freezes remaining and resume continues from there', () => {
  let s = Timer.create(settings);
  s = Timer.start(s, 0);
  s = Timer.pause(s, 10 * MIN);
  assert.equal(s.running, false);
  assert.equal(Timer.remaining(s, 99 * MIN), 15 * MIN);
  s = Timer.start(s, 100 * MIN);
  assert.equal(Timer.remaining(s, 105 * MIN), 10 * MIN);
});

test('remaining never goes below zero', () => {
  let s = Timer.create(settings);
  s = Timer.start(s, 0);
  assert.equal(Timer.remaining(s, 30 * MIN), 0);
});

test('progress is the fraction of the session still left', () => {
  let s = Timer.create(settings);
  s = Timer.start(s, 0);
  assert.equal(Timer.progress(s, settings, 0), 1);
  assert.equal(Timer.progress(s, settings, 12.5 * MIN), 0.5);
  assert.equal(Timer.progress(s, settings, 25 * MIN), 0);
});

test('finishing a focus session counts it and moves to a short break', () => {
  let s = Timer.create(settings);
  s = Timer.start(s, 0);
  const r = Timer.tick(s, 25 * MIN);
  assert.equal(r.finished, true);
  assert.equal(r.state.completed, 1);
  assert.equal(r.state.mode, 'short');
  assert.equal(r.state.running, false);
  assert.equal(Timer.remaining(r.state, 25 * MIN), 5 * MIN);
});

test('every fourth focus session is followed by a long break', () => {
  let s = Timer.create(settings);
  s.completed = 3;
  s = Timer.start(s, 0);
  const r = Timer.tick(s, 25 * MIN);
  assert.equal(r.state.completed, 4);
  assert.equal(r.state.mode, 'long');
  assert.equal(Timer.remaining(r.state, 0), 15 * MIN);
});

test('finishing a break returns to focus without counting', () => {
  let s = Timer.setMode(Timer.create(settings), 'short', settings);
  s = Timer.start(s, 0);
  const r = Timer.tick(s, 5 * MIN);
  assert.equal(r.finished, true);
  assert.equal(r.state.mode, 'focus');
  assert.equal(r.state.completed, 0);
});

test('tick before the end is not finished and leaves state alone', () => {
  let s = Timer.create(settings);
  s = Timer.start(s, 0);
  const r = Timer.tick(s, 1 * MIN);
  assert.equal(r.finished, false);
  assert.equal(r.state, s);
});

test('tick while paused never finishes', () => {
  const s = Timer.create(settings);
  const r = Timer.tick(s, 999 * MIN);
  assert.equal(r.finished, false);
});

test('reset returns the current mode to full length and pauses', () => {
  let s = Timer.create(settings);
  s = Timer.start(s, 0);
  s = Timer.reset(s, settings);
  assert.equal(s.running, false);
  assert.equal(Timer.remaining(s, 5 * MIN), 25 * MIN);
});

test('switching mode resets to that mode length', () => {
  let s = Timer.create(settings);
  s = Timer.start(s, 0);
  s = Timer.setMode(s, 'long', settings);
  assert.equal(s.mode, 'long');
  assert.equal(s.running, false);
  assert.equal(Timer.remaining(s, 0), 15 * MIN);
});

test('format shows mm:ss and rounds up partial seconds', () => {
  assert.equal(Timer.format(25 * MIN), '25:00');
  assert.equal(Timer.format(24 * MIN + 59 * 1000 + 400), '25:00');
  assert.equal(Timer.format(9 * MIN + 5 * 1000), '09:05');
  assert.equal(Timer.format(0), '00:00');
  assert.equal(Timer.format(90 * MIN), '90:00');
});

test('completed count resets on a new day', () => {
  let s = Timer.create(settings, '2026-09-14');
  s.completed = 3;
  s = Timer.forDay(s, '2026-09-15');
  assert.equal(s.completed, 0);
  assert.equal(s.day, '2026-09-15');
  const same = Timer.forDay({ ...s, completed: 2 }, '2026-09-15');
  assert.equal(same.completed, 2);
});
