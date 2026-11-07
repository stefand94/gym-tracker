import { MUSCLE_LABELS, type MuscleId } from '../data/muscles';
import type { MuscleLoad } from '../lib/muscleLoad';

/*
 * Front and back figures, 200 × 460 each. Only the viewer's left half is drawn;
 * it is mirrored for the right half, so every muscle is symmetric.
 */

const SILHOUETTE =
  'M100 54 L91 55 Q90 64 85 68 Q68 72 57 78 Q42 85 40 101 Q38 116 41 130 Q40 148 39 166 ' +
  'Q33 190 33 212 Q33 226 35 236 Q33 248 39 253 Q46 252 46 239 Q49 227 53 214 Q59 192 62 172 ' +
  'Q64 152 66 138 Q68 162 68 190 Q66 210 62 228 Q59 262 62 298 Q64 322 68 340 Q63 370 67 400 ' +
  'Q69 420 69 432 Q63 444 73 447 Q85 448 85 433 Q84 412 86 396 Q90 368 88 344 Q93 312 96 282 ' +
  'Q98 266 100 260 Z';

type Region = [MuscleId, string];

const FRONT: Region[] = [
  ['neck', 'M92 56 Q95 64 99 72 L95 74 Q90 66 88 60 Z'],
  ['traps', 'M88 62 Q78 69 63 75 Q70 79 79 77 Q88 75 94 74 Q90 68 88 62 Z'],
  ['sideDelts', 'M60 77 Q46 81 42 97 Q41 107 44 115 L49 113 Q47 98 54 87 Q60 81 66 79 Z'],
  ['frontDelts', 'M67 79 Q57 84 51 98 Q49 106 50 114 Q60 105 67 97 Q72 89 74 81 Z'],
  ['chest', 'M99 84 L99 131 Q86 138 73 132 Q65 124 66 106 Q69 90 79 83 Q91 80 99 84 Z'],
  ['abs', 'M99 137 L99 222 Q91 224 87 218 L85 143 Q90 136 99 137 Z'],
  ['obliques', 'M83 141 L85 218 Q78 214 73 206 Q70 182 70 160 Q70 143 74 135 Q78 139 83 141 Z'],
  ['biceps', 'M50 117 Q59 112 64 120 Q65 146 59 165 Q51 170 47 164 Q42 145 44 128 Q46 119 50 117 Z'],
  ['forearms', 'M45 171 Q53 168 59 173 Q58 197 52 222 Q46 227 41 222 Q36 201 38 185 Q40 175 45 171 Z'],
  ['abductors', 'M64 226 Q69 231 70 240 Q67 256 64 270 Q61 251 61 237 Q62 229 64 226 Z'],
  ['quads', 'M71 236 Q83 241 90 251 Q92 290 88 326 Q82 336 76 334 Q68 322 66 296 Q64 262 71 236 Z'],
  ['adductors', 'M92 253 Q98 257 99 263 Q99 291 92 313 Q90 281 92 253 Z'],
  ['calves', 'M70 347 Q78 342 84 348 Q86 372 82 400 Q78 410 74 408 Q68 390 68 368 Q68 355 70 347 Z'],
];

const BACK: Region[] = [
  ['traps', 'M99 56 L99 141 Q92 129 86 113 Q80 97 67 84 Q58 79 60 77 Q76 70 88 64 Q94 60 99 56 Z'],
  ['sideDelts', 'M58 77 Q45 82 41 98 Q41 108 44 115 L48 113 Q46 97 58 83 Z'],
  ['rearDelts', 'M61 79 Q50 85 48 99 Q47 107 49 113 Q55 101 64 93 Q67 85 61 79 Z'],
  ['upperBack', 'M67 93 Q78 99 85 115 Q87 127 80 136 Q70 132 67 120 Q65 105 67 93 Z'],
  ['lats', 'M66 125 Q71 136 82 140 Q92 145 99 151 L99 177 Q88 187 78 197 Q72 181 70 161 Q66 141 66 125 Z'],
  ['lowerBack', 'M99 179 L99 225 Q92 227 88 221 Q86 201 88 187 Q94 181 99 179 Z'],
  ['triceps', 'M46 117 Q56 112 62 120 Q64 146 58 166 Q50 170 46 164 Q42 144 43 128 Q44 119 46 117 Z'],
  ['forearms', 'M45 171 Q53 168 59 173 Q58 197 52 222 Q46 227 41 222 Q36 201 38 185 Q40 175 45 171 Z'],
  ['abductors', 'M65 218 Q74 213 85 218 Q74 224 68 236 Q63 228 65 218 Z'],
  ['glutes', 'M99 230 Q99 262 90 268 Q76 271 68 259 Q63 243 68 231 Q80 222 99 230 Z'],
  ['hamstrings', 'M68 273 Q80 277 92 273 Q93 301 89 326 Q82 335 76 331 Q66 313 66 291 Q66 281 68 273 Z'],
  ['adductors', 'M95 273 Q99 291 95 313 Q93 297 93 275 Z'],
  ['calves', 'M70 344 Q80 338 88 346 Q90 366 84 388 Q78 397 74 393 Q66 377 66 360 Q66 351 70 344 Z'],
];

interface Props {
  load: MuscleLoad;
  /** Value that maps to full colour. Defaults to the max in `load`. */
  scaleMax?: number;
  size?: 'mini' | 'small' | 'large';
  selected?: MuscleId | null;
  onSelect?: (m: MuscleId) => void;
  labels?: boolean;
}

function fillFor(value: number, max: number): string {
  if (value <= 0 || max <= 0) return 'var(--muscle-idle)';
  const t = Math.min(1, value / max);
  const pct = Math.round(25 + t * 75);
  return `color-mix(in oklab, var(--heat) ${pct}%, var(--muscle-idle))`;
}

function Figure({
  regions,
  load,
  max,
  selected,
  onSelect,
  title,
}: {
  regions: Region[];
  load: MuscleLoad;
  max: number;
  selected?: MuscleId | null;
  onSelect?: (m: MuscleId) => void;
  title: string;
}) {
  const half = (
    <>
      <path d={SILHOUETTE} className="bm-body" />
      {regions.map(([m, d]) => (
        <path
          key={m + d.slice(0, 8)}
          d={d}
          data-muscle={m}
          fill={fillFor(load[m], max)}
          className={'bm-muscle' + (selected === m ? ' bm-selected' : '') + (onSelect ? ' bm-clickable' : '')}
          onClick={onSelect ? () => onSelect(m) : undefined}
        >
          <title>{MUSCLE_LABELS[m]}</title>
        </path>
      ))}
    </>
  );
  return (
    <svg viewBox="0 0 200 460" className="bm-figure" role="img" aria-label={title}>
      <ellipse cx="100" cy="30" rx="19" ry="24" className="bm-body" />
      <g>{half}</g>
      <g transform="translate(200 0) scale(-1 1)">{half}</g>
    </svg>
  );
}

export function BodyMap({ load, scaleMax, size = 'small', selected, onSelect, labels }: Props) {
  const max = scaleMax ?? Math.max(0, ...Object.values(load));
  return (
    <div className={`bm bm-${size}`}>
      <figure>
        <Figure regions={FRONT} load={load} max={max} selected={selected} onSelect={onSelect} title="Front" />
        {labels && <figcaption>Front</figcaption>}
      </figure>
      <figure>
        <Figure regions={BACK} load={load} max={max} selected={selected} onSelect={onSelect} title="Back" />
        {labels && <figcaption>Back</figcaption>}
      </figure>
    </div>
  );
}
