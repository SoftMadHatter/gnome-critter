import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isNight, BreakTracker, IdleTracker } from '../core/rhythm.js';

test('isNight : fenêtre qui passe minuit, bornes, fenêtre normale', () => {
  assert.equal(isNight(23), true);
  assert.equal(isNight(2), true);
  assert.equal(isNight(6), true);
  assert.equal(isNight(7), false);
  assert.equal(isNight(12), false);
  assert.equal(isNight(22), false);
  assert.equal(isNight(13, { start: 12, end: 14 }), true);
  assert.equal(isNight(15, { start: 12, end: 14 }), false);
  assert.equal(isNight(3, { start: 5, end: 5 }), false);
});

test('BreakTracker : un rappel après l\'intervalle, une seule fois, puis délai de grâce', () => {
  const t = new BreakTracker({ interval: 100, cooldown: 50, resetIdle: 30 });
  let reminders = 0;
  for (let i = 0; i < 99; i++) if (t.advance(1, 0)) reminders += 1;
  assert.equal(reminders, 0);
  assert.equal(t.advance(1, 0), 'remind');
  for (let i = 0; i < 149; i++) assert.equal(t.advance(1, 0), null, `grâce puis nouvel intervalle (${i})`);
  assert.equal(t.advance(1, 0), 'remind', 'le rappel suivant revient après grâce + intervalle');
});

test('BreakTracker : une vraie pause remet à zéro, une courte inactivité non', () => {
  const t = new BreakTracker({ interval: 100, resetIdle: 30, cooldown: 0 });
  for (let i = 0; i < 90; i++) t.advance(1, 0);
  t.advance(1, 10); // courte inactivité : l'activité continue de compter
  assert.ok(t.activeSeconds > 0);
  t.advance(1, 60); // vraie pause
  assert.equal(t.activeSeconds, 0);
  for (let i = 0; i < 99; i++) assert.equal(t.advance(1, 0), null);
  assert.equal(t.advance(1, 0), 'remind');
});

test('BreakTracker : acquittement et désactivation', () => {
  const t = new BreakTracker({ interval: 10, cooldown: 5 });
  for (let i = 0; i < 9; i++) t.advance(1, 0);
  t.acknowledge();
  assert.equal(t.activeSeconds, 0);
  for (let i = 0; i < 14; i++) assert.equal(t.advance(1, 0), null);

  const off = new BreakTracker({ interval: 1, enabled: false });
  for (let i = 0; i < 50; i++) assert.equal(off.advance(1, 0), null);
});

test('IdleTracker : absence et retour signalés une seule fois', () => {
  const t = new IdleTracker({ awayAfter: 600 });
  assert.equal(t.update(10), null);
  assert.equal(t.update(599), null);
  assert.equal(t.update(600), 'away');
  assert.equal(t.update(900), null);
  assert.equal(t.update(2), 'returned');
  assert.equal(t.update(3), null);
  assert.equal(t.away, false);
});
