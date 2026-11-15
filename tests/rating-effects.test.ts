import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createRatingEffects } from '../src/ratingEffects';

function fixture(reducedMotion: boolean) {
  const dom = new JSDOM('<div id="rating"><input type="range" value="100"><canvas class="bacon-cooking"></canvas><canvas class="bacon-liquid"></canvas><div class="bacon-plate"></div><div class="bacon-score"></div><output></output><span class="bacon-phrase"></span></div>', { pretendToBeVisual: true });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document });
  const frames = new Map<number, FrameRequestCallback>();
  let nextId = 0, disconnected = false;
  dom.window.requestAnimationFrame = callback => { frames.set(++nextId, callback); return nextId; };
  dom.window.cancelAnimationFrame = id => { frames.delete(id); };
  const preference = new dom.window.EventTarget();
  Object.assign(preference, { matches: reducedMotion });
  Object.defineProperty(dom.window, 'matchMedia', { value: () => preference });
  Object.defineProperty(dom.window, 'ResizeObserver', { value: class {
    observe() {}
    disconnect() { disconnected = true; }
  } });
  // Simulate a browser that denies both canvas contexts; CSS must remain usable.
  dom.window.HTMLCanvasElement.prototype.getContext = () => null;
  let animations = 0;
  Object.defineProperty(dom.window.HTMLElement.prototype, 'animate', { value: () => { animations++; return { cancel() {} }; } });
  const card = dom.window.document.getElementById('rating')!;
  const effects = createRatingEffects(card);
  function step(now: number) {
    const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(now));
  }
  return { dom, effects, frames, step, preference, card, animations: () => animations, disconnected: () => disconnected };
}

test('Rating effects: reduced motion keeps score interactions static and cleanup removes scheduled work', () => {
  const f = fixture(true);
  try {
    f.effects.update(100, 6, true);
    f.step(performance.now());
    assert.equal(f.animations(), 0);
    assert.equal(f.frames.size, 0);
    f.effects.dispose();
    f.preference.dispatchEvent(new f.dom.window.Event('change'));
    f.dom.window.document.dispatchEvent(new f.dom.window.Event('visibilitychange'));
    assert.equal(f.frames.size, 0);
    assert.equal(f.disconnected(), true);
  } finally { f.effects.dispose(); f.dom.window.close(); }
});

test('Rating effects: unavailable canvases fall back and never leave a perpetual animation loop', () => {
  const f = fixture(false);
  try {
    f.effects.update(100, 6, true);
    f.step(performance.now() + 5000);
    assert.equal(f.frames.size, 0);
    assert.equal((f.card.querySelector('.bacon-liquid') as HTMLElement).style.display, 'none');
    f.effects.update(80, 4, true);
    assert.equal(f.frames.size, 1);
    f.effects.dispose();
    assert.equal(f.frames.size, 0);
  } finally { f.effects.dispose(); f.dom.window.close(); }
});
