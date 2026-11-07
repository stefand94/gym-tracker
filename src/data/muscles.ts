export const MUSCLE_IDS = [
  'neck',
  'traps',
  'frontDelts',
  'sideDelts',
  'rearDelts',
  'chest',
  'biceps',
  'triceps',
  'forearms',
  'lats',
  'upperBack',
  'lowerBack',
  'abs',
  'obliques',
  'glutes',
  'abductors',
  'adductors',
  'quads',
  'hamstrings',
  'calves',
] as const;

export type MuscleId = (typeof MUSCLE_IDS)[number];

export const MUSCLE_LABELS: Record<MuscleId, string> = {
  neck: 'Neck',
  traps: 'Traps',
  frontDelts: 'Front delts',
  sideDelts: 'Side delts',
  rearDelts: 'Rear delts',
  chest: 'Chest',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  lats: 'Lats',
  upperBack: 'Upper back',
  lowerBack: 'Lower back',
  abs: 'Abs',
  obliques: 'Obliques',
  glutes: 'Glutes',
  abductors: 'Abductors',
  adductors: 'Adductors',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  calves: 'Calves',
};

export function isMuscleId(x: string): x is MuscleId {
  return (MUSCLE_IDS as readonly string[]).includes(x);
}
