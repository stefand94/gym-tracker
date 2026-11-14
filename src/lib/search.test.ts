import { describe, expect, it } from 'vitest';
import { EXERCISES } from '../data/library';
import { normalize, searchExercises } from './search';

const ids = (q: string) => searchExercises(EXERCISES, q).map((e) => e.id);

describe('normalize', () => {
  it('folds synonyms and plurals', () => {
    expect(normalize('One-arm cable rows')).toBe('single cable row');
    expect(normalize('1 arm DB row')).toBe('single dumbbell row');
    expect(normalize('Lat pull down')).toBe('lat pulldown');
    expect(normalize('Z bar curl')).toBe('ez curl');
    expect(normalize('EZ-bar curl')).toBe('ez curl');
    expect(normalize('tricep push downs')).toBe('tricep pushdown');
    expect(normalize('Triceps')).toBe('tricep');
    expect(normalize('RDL')).toBe('romanian deadlift');
    expect(normalize('push ups')).toBe(normalize('Push-up'));
  });
});

describe('searchExercises', () => {
  it('finds the single-arm cable row from how people say it', () => {
    expect(ids('one arm cable row')[0]).toBe('single-arm-cable-row');
    expect(ids('cable row one arm')[0]).toBe('single-arm-cable-row');
    expect(ids('unilateral cable row')[0]).toBe('single-arm-cable-row');
  });

  it('ranks name-prefix matches first', () => {
    expect(ids('lat')[0]).toBe('lat-pulldown');
    expect(ids('rope push')[0]).toBe('triceps-rope-pushdown');
  });

  it('uses synonyms and aliases', () => {
    expect(ids('rdl')).toContain('romanian-deadlift');
    expect(ids('rdl')).toContain('single-leg-rdl');
    expect(ids('ohp')[0]).toBe('overhead-press');
    expect(ids('z bar curl')).toContain('ez-bar-curl');
    expect(ids('lying triceps extension')[0]).toBe('skull-crusher');
    expect(ids('machine fly')).toContain('pec-deck');
  });

  it('falls back to equipment and muscles, after name matches', () => {
    const r = ids('cable biceps');
    expect(r).toContain('cable-curl');
    expect(r).toContain('bayesian-curl');
    const h = ids('hamstring');
    expect(h.slice(0, 2).sort()).toEqual(['nordic-curl', 'slider-hamstring-curl']);
    // alias match (leg curl: "hamstring curl") before muscle-only matches
    expect(h.indexOf('leg-curl')).toBeLessThan(h.indexOf('romanian-deadlift'));
  });

  it('finds the names Stefan uses at the gym', () => {
    expect(ids('decline bench')).toContain('decline-barbell-bench-press');
    expect(ids('split rope pushdown')[0]).toBe('triceps-rope-pushdown');
    expect(ids('21s')[0]).toBe('twenty-ones');
    expect(ids('6 inches')[0]).toBe('six-inches');
    expect(ids('knee ups')[0]).toBe('hanging-knee-raise');
    expect(ids('front fly')[0]).toBe('front-raise');
    expect(ids('arm pad curl')[0]).toBe('preacher-curl');
    expect(ids('one arm tricep extension cable')).toContain('single-arm-cable-triceps-extension');
  });

  it('returns nothing for nonsense and everything for an empty query', () => {
    expect(ids('zzzq')).toEqual([]);
    expect(ids('  ')).toHaveLength(EXERCISES.length);
  });
});
