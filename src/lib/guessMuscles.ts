import type { MuscleId } from '../data/muscles';
import type { ExerciseType } from '../types';
import { normalize } from './search';

export interface Guess {
  primary: MuscleId[];
  secondary: MuscleId[];
  type: ExerciseType;
  equipment: string;
}

type Rule = [RegExp, MuscleId[], MuscleId[]];

// Checked in order on the normalized name (see search.ts: plurals stripped, "pull down" → pulldown…);
// the first match wins, so specific phrases come before general ones.
const RULES: Rule[] = [
  [/\b(back|hyper) ?extension|\bgood morning/, ['lowerBack'], ['glutes', 'hamstrings']],
  [/\b(leg|hamstring|nordic|slider) curl|\bnordic/, ['hamstrings'], ['calves']],
  [/\bwrist curl|\breverse curl|\bwrist/, ['forearms'], ['biceps']],
  [/\bhammer curl/, ['biceps', 'forearms'], []],
  [/\bcurl/, ['biceps'], ['forearms']],
  [/\bleg extension|\bquad/, ['quads'], []],
  [/\btricep|\bpushdown|\bskull|\bfrench press|\boverhead extension/, ['triceps'], []],
  [/\bglute kickback|\bdonkey kick/, ['glutes'], ['hamstrings']],
  [/\bkickback/, ['triceps'], []],
  [/\bface pull|\brear delt|\breverse (fly|pec)/, ['rearDelts'], ['upperBack', 'traps']],
  [/\bexternal rotation|\brotator|\bcuff/, ['rearDelts'], ['upperBack']],
  [/\bpullover/, ['lats'], ['chest', 'triceps']],
  [/\bpulldown|\bpullup|\bchinup|\bpull up|\blat\b/, ['lats'], ['biceps', 'upperBack']],
  [/\brow\b/, ['upperBack', 'lats'], ['rearDelts', 'biceps']],
  [/\bshrug/, ['traps'], ['forearms']],
  [/\b(lateral|side|y) raise|\bupright/, ['sideDelts'], ['traps']],
  [/\bfront raise/, ['frontDelts'], ['sideDelts']],
  [/\b(shoulder|overhead|military|arnold|landmine) press|\bohp/, ['frontDelts'], ['sideDelts', 'triceps']],
  [/\bincline (bench|press|dumbbell|fly)/, ['chest', 'frontDelts'], ['triceps']],
  [/\bdip\b/, ['triceps', 'chest'], ['frontDelts']],
  [/\bfly\b|\bcrossover|\bpec\b/, ['chest'], ['frontDelts']],
  [/\bbench|\bchest press|\bpushup|\bpress up/, ['chest'], ['frontDelts', 'triceps']],
  [/\bhip thrust|\bbridge/, ['glutes'], ['hamstrings']],
  [/\babduct/, ['abductors'], ['glutes']],
  [/\badduct|\bcopenhagen/, ['adductors'], []],
  [/\bromanian|\bdeadlift|\bhinge|\bpull ?through|\bswing/, ['hamstrings', 'glutes'], ['lowerBack']],
  [/\bsquat|\bleg press|\blunge|\bstepup|\bsplit/, ['quads', 'glutes'], ['hamstrings', 'adductors']],
  [/\bcalf|\bcalve/, ['calves'], []],
  [/\bside plank|\btwist|\bwoodchop|\bpallof|\boblique/, ['obliques'], ['abs']],
  [/\bcrunch|\bsitup|\bleg raise|\bknee raise|\bplank|\brollout|\bdead bug|\bhollow|\bab\b/, ['abs'], ['obliques']],
  [/\bcarry|\bfarmer|\bhang\b/, ['forearms'], ['traps']],
  [/\bneck/, ['neck'], []],
  [/\bpress\b/, ['chest'], ['frontDelts', 'triceps']],
];

const EQUIPMENT: [RegExp, string][] = [
  [/\bsmith/, 'Smith machine'],
  [/\bcable|\brope|\bpulldown|\bpushdown|\bface pull/, 'Cable'],
  [/\bdumbbell/, 'Dumbbells'],
  [/\bez\b/, 'EZ bar'],
  [/\bbarbell|\bbench press|\bdeadlift|\bsquat|\blandmine/, 'Barbell'],
  [/\bkettlebell/, 'Kettlebell'],
  [/\bband/, 'Band'],
  [/\bmachine|\bpec deck|\bleg press|\bleg extension|\bleg curl|\bhack/, 'Machine'],
  [/\bpushup|\bpullup|\bchinup|\bdip\b|\bplank|\bbodyweight|\bnordic|\bhang\b|\bsitup|\bcrunch|\bbridge/, 'Bodyweight'],
];

/** Best guess at muscles, equipment and type from an exercise name. Empty muscles when nothing matches. */
export function guessFromName(name: string): Guess {
  const n = normalize(name);
  const rule = RULES.find(([re]) => re.test(n));
  const equipment = EQUIPMENT.find(([re]) => re.test(n))?.[1] ?? '';
  const timed = /\bhold\b|\bplank|\bhang\b|\biso/.test(n);
  const type: ExerciseType = timed ? 'timed' : equipment === 'Machine' ? 'machine' : equipment === 'Bodyweight' ? 'bodyweight' : 'weight';
  return { primary: rule ? [...rule[1]] : [], secondary: rule ? [...rule[2]] : [], type, equipment };
}
