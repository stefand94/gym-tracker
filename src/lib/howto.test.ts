import { describe, expect, it } from 'vitest';
import howtoJson from '../data/howto.json';
import { cleanVideoUrl, howToFor, youtubeSearchUrl } from '../data/howto';
import { EXERCISES, getExercise } from '../data/library';
import { load, reducer } from '../state/store';
import { mergeKeyed } from './merge';

describe('how-to guides', () => {
  it('has a 3–4 step guide for every bundled exercise, and none for exercises that do not exist', () => {
    for (const e of EXERCISES) {
      const h = howToFor(e);
      expect(h, e.id).toBeDefined();
      expect(h!.steps.length, e.id).toBeGreaterThanOrEqual(3);
      expect(h!.steps.length, e.id).toBeLessThanOrEqual(4);
    }
    for (const id of Object.keys(howtoJson)) expect(getExercise(id), id).toBeDefined();
  });

  it('prefers a guide on the exercise itself', () => {
    const ex = { ...getExercise('arnold-press')!, howto: { steps: ['a', 'b', 'c'] } };
    expect(howToFor(ex)!.steps).toEqual(['a', 'b', 'c']);
  });

  it('searches YouTube for "<name> form"', () => {
    expect(youtubeSearchUrl('Arnold press')).toBe('https://www.youtube.com/results?search_query=Arnold%20press%20form');
  });

  it('only keeps http(s) links', () => {
    expect(cleanVideoUrl(' youtu.be/abc ')).toBe('https://youtu.be/abc');
    expect(cleanVideoUrl('https://www.youtube.com/watch?v=x')).toBe('https://www.youtube.com/watch?v=x');
    expect(cleanVideoUrl('javascript:alert(1)')).toBeNull();
    expect(cleanVideoUrl('')).toBeNull();
  });
});

describe('pinned videos', () => {
  it('merges entry by entry, newest wins, removals included', () => {
    const a = { x: { url: 'a', updatedAt: '2026-11-01' }, y: { url: 'y', updatedAt: '2026-11-05' } };
    const b = {
      x: { url: '', updatedAt: '2026-11-02' },
      y: { url: 'old', updatedAt: '2026-11-01' },
      z: { url: 'z', updatedAt: '2026-11-03' },
    };
    expect(mergeKeyed(a, b)).toEqual({ x: b.x, y: a.y, z: b.z });
  });

  it('queues the pin file to sync', () => {
    const s = reducer(load(), { type: 'videoPin', exerciseId: 'arnold-press', url: 'https://youtu.be/abc', now: '2026-11-14T10:00:00Z' });
    expect(s.videos['arnold-press'].url).toBe('https://youtu.be/abc');
    expect(s.sync.queue).toMatchObject([{ op: 'put', kind: 'videos', id: 'videos' }]);
  });
});
