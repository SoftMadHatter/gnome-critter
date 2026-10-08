#!/usr/bin/env node
// Headless simulation of the critters on a desktop layout, to find where
// they end up off-screen (rescues) or jitter in place (direction flips).
// core/ is pure, so the Manager's loop is replayed here without GNOME Shell:
// same species config as Manager.spawn, `ensureVisible` then `tick` every frame.
//
//   node tools/simulate-surfaces.mjs [--minutes 20] [--seeds 3] [--species cat,bird]
//
// Prints, per species and layout: rescues grouped by where and in which state
// they happened, and episodes of direction flips with little movement.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { Critter, Locomotion, State, behaviorOverrides } from '../core/critter.js';
import { needsOverrides } from '../core/needs.js';
import { computeSurfaces } from '../core/surfaceMap.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DT = 1 / 30;
const TOP_BAR = 32; // the shell's top bar: a maximized window starts below it

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, arg, i, all) => {
    if (arg.startsWith('--')) acc.push([arg.slice(2), all[i + 1]]);
    return acc;
  }, []),
);
const MINUTES = Number(args.minutes ?? 20);
const SEEDS = Number(args.seeds ?? 3);
const SPECIES = (args.species ?? 'cat,bird,fish,bug').split(',');

/** Small seeded generator (mulberry32): the runs are reproducible. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LAYOUTS = {
  'single': { monitors: [{ x: 0, y: 0, width: 1920, height: 1080 }] },
  'offset (laptop under, HP)': {
    monitors: [
      { x: 0, y: 298, width: 1920, height: 1080 },
      { x: 1920, y: 0, width: 1920, height: 1080 },
    ],
  },
  'offset, window flush with the screen top': {
    bar: 0, // a maximized or fullscreen window whose top is the top edge of the screen
    monitors: [
      { x: 0, y: 298, width: 1920, height: 1080 },
      { x: 1920, y: 0, width: 1920, height: 1080 },
    ],
  },
  'side by side, different sizes': {
    monitors: [
      { x: 0, y: 0, width: 1600, height: 900 },
      { x: 1600, y: 100, width: 2560, height: 1440 },
    ],
  },
};

function windowsFor(monitors, random, bar) {
  const windows = [];
  let id = 0;
  for (const m of monitors) {
    // One maximized window per monitor, below the top bar: its top is a ledge with no headroom.
    windows.push({ id: `max${id++}`, x: m.x, y: m.y + bar, width: m.width, height: m.height - bar });
  }
  for (let i = 0; i < 4; i++) {
    const m = monitors[Math.floor(random() * monitors.length)];
    const width = 300 + random() * 600;
    const height = 200 + random() * 400;
    windows.push({
      id: `w${id++}`,
      x: m.x + random() * (m.width - width),
      y: m.y + random() * (m.height - height),
      width,
      height,
    });
  }
  return windows;
}

function critterFor(species, random, start) {
  const pack = JSON.parse(readFileSync(join(ROOT, 'packs', species, 'pack.json'), 'utf8'));
  const behavior = behaviorOverrides(pack.behavior);
  const needs = needsOverrides(pack.needs);
  const speeds = pack.speeds ?? {};
  const critter = new Critter(
    {
      ...behavior.config,
      needsRates: needs.rates,
      needsDiet: needs.diet,
      needsPrey: needs.prey,
      speciesId: species,
      walkSpeed: speeds.walk ?? 40,
      climbSpeed: speeds.climb ?? 30,
      swimSpeed: speeds.swim ?? 25,
      flySpeed: speeds.fly ?? 60,
      supportedSurfaces: new Set((pack.supportedSurfaces ?? ['ground']).map((s) => Locomotion[s.toUpperCase()] ?? s)),
      random,
    },
    start,
  );
  return { critter, spriteHeight: pack.spriteSize?.height ?? 32 };
}

function zoneOf(monitors, x, y) {
  const inside = (m) => x >= m.x && x <= m.x + m.width && y >= m.y && y <= m.y + m.height;
  if (monitors.some(inside)) return 'inside';
  const xs = monitors.some((m) => x >= m.x && x <= m.x + m.width);
  const ys = monitors.some((m) => y >= m.y && y <= m.y + m.height);
  const minY = Math.min(...monitors.map((m) => m.y));
  const maxY = Math.max(...monitors.map((m) => m.y + m.height));
  if (y < minY) return 'above all screens';
  if (y > maxY) return 'below all screens';
  if (xs && !ys) return 'dead zone (above/below a screen)';
  return 'dead zone / beside a screen';
}

function run(species, layoutName, layout, seed) {
  const random = rng(seed * 7919 + species.length);
  const { monitors } = layout;
  const windows = windowsFor(monitors, random, layout.bar ?? TOP_BAR);
  const surfaces = computeSurfaces({ monitors, windows });
  const minX = Math.min(...monitors.map((m) => m.x));
  const minY = Math.min(...monitors.map((m) => m.y));
  const maxX = Math.max(...monitors.map((m) => m.x + m.width));
  const maxY = Math.max(...monitors.map((m) => m.y + m.height));
  const worldBounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  const m0 = monitors[0];
  const { critter, spriteHeight } = critterFor(species, random, { x: m0.x + m0.width * 0.4, y: m0.y + spriteHeight0(species) });

  const rescues = [];
  const flips = [];
  let pointer = { x: m0.x + 400, y: m0.y + 300 };
  let lastFacing = critter.facing;
  const recent = []; // [{flip, x}] over the last 30 ticks
  let lastFlipEpisode = -1000;
  const ticks = Math.round((MINUTES * 60) / DT);

  for (let i = 0; i < ticks; i++) {
    // The cursor wanders (random target every few seconds, linear move).
    if (i % 150 === 0) pointer.target = { x: minX + random() * (maxX - minX), y: minY + random() * (maxY - minY) };
    if (pointer.target) {
      pointer.x += (pointer.target.x - pointer.x) * 0.02;
      pointer.y += (pointer.target.y - pointer.y) * 0.02;
    }
    const before = { x: critter.x, y: critter.y, state: critter.state };
    if (critter.ensureVisible(monitors, spriteHeight)) {
      rescues.push({ ...before, zone: zoneOf(monitors, before.x, before.y - 1), t: i * DT });
    }
    critter.tick(DT, surfaces, {
      worldBounds,
      pointer: { x: pointer.x, y: pointer.y },
      otherCritters: undefined,
      items: [],
      ambient: { night: false, away: false, breakReminder: false },
      progress: { now: 1_700_000_000_000 + i * 33 },
    });
    const flip = critter.facing !== lastFacing ? 1 : 0;
    lastFacing = critter.facing;
    recent.push({ flip, x: critter.x });
    if (recent.length > 30) recent.shift();
    const flipCount = recent.reduce((s, r) => s + r.flip, 0);
    const spread = Math.max(...recent.map((r) => r.x)) - Math.min(...recent.map((r) => r.x));
    if (flipCount >= 8 && spread < 6 && i - lastFlipEpisode > 90) {
      lastFlipEpisode = i;
      flips.push({ state: critter.state, x: Math.round(critter.x), y: Math.round(critter.y), t: i * DT });
    }
  }
  return { rescues, flips };
}

function spriteHeight0(species) {
  return JSON.parse(readFileSync(join(ROOT, 'packs', species, 'pack.json'), 'utf8')).spriteSize?.height ?? 32;
}

function tally(items, keyFn) {
  const counts = new Map();
  for (const item of items) counts.set(keyFn(item), (counts.get(keyFn(item)) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

for (const species of SPECIES) {
  for (const [layoutName, layout] of Object.entries(LAYOUTS)) {
    const rescues = [];
    const flips = [];
    for (let seed = 1; seed <= SEEDS; seed++) {
      const result = run(species, layoutName, layout, seed);
      rescues.push(...result.rescues);
      flips.push(...result.flips);
    }
    const hours = (MINUTES * SEEDS) / 60;
    console.log(`\n== ${species} / ${layoutName}: ${rescues.length} rescues, ${flips.length} flip episodes in ${hours.toFixed(1)} h simulated`);
    for (const [key, n] of tally(rescues, (r) => `${r.zone} | state ${r.state}`).slice(0, 6)) console.log(`   rescue  ${String(n).padStart(4)}  ${key}`);
    for (const [key, n] of tally(flips, (f) => `state ${f.state}`).slice(0, 4)) console.log(`   flicker ${String(n).padStart(4)}  ${key}`);
  }
}
