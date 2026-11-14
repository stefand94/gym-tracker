import { describe, expect, it } from 'vitest';
import { guessFromName } from './guessMuscles';
import { slugify, uniqueId } from '../components/ExerciseEditor';

const g = (n: string) => guessFromName(n);

describe('guessFromName', () => {
  it('reads the movement', () => {
    expect(g('One arm cable row').primary).toEqual(['upperBack', 'lats']);
    expect(g('Rope pushdown').primary).toEqual(['triceps']);
    expect(g('Seated leg curl').primary).toEqual(['hamstrings']);
    expect(g('Spider curls').primary).toEqual(['biceps']);
    expect(g('Cable glute kickback').primary).toEqual(['glutes']);
    expect(g('DB kickbacks').primary).toEqual(['triceps']);
    expect(g('Lat pull down close grip').primary).toEqual(['lats']);
    expect(g('Incline DB press').primary).toEqual(['chest', 'frontDelts']);
    expect(g('Landmine press').primary).toEqual(['frontDelts']);
    expect(g('Copenhagen plank').primary).toEqual(['adductors']);
    expect(g('Banded thing').primary).toEqual([]);
  });

  it('guesses equipment and type', () => {
    expect(g('One arm cable row')).toMatchObject({ equipment: 'Cable', type: 'weight' });
    expect(g('Pec deck machine')).toMatchObject({ equipment: 'Machine', type: 'machine' });
    expect(g('Weighted pull ups')).toMatchObject({ equipment: 'Bodyweight', type: 'bodyweight' });
    expect(g('Side plank hold')).toMatchObject({ type: 'timed', primary: ['obliques'] });
    expect(g('EZ bar skull crusher').equipment).toBe('EZ bar');
  });
});

describe('custom exercise ids', () => {
  it('slugifies and avoids taken ids', () => {
    expect(slugify('One-arm Cable Row (rope)!')).toBe('one-arm-cable-row-rope');
    expect(uniqueId('Lat pulldown', new Set(['lat-pulldown', 'lat-pulldown-2']))).toBe('lat-pulldown-3');
    expect(slugify('💪')).toBe('exercise');
  });
});
