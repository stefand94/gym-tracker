import { useState } from 'react';
import { cleanVideoUrl, howToFor, youtubeSearchUrl } from '../data/howto';
import { MUSCLE_LABELS } from '../data/muscles';
import { exerciseMap } from '../lib/muscleLoad';
import { useStore } from '../state/store';
import type { Exercise } from '../types';
import { BodyMap } from './BodyMap';
import { Sheet } from './Sheet';

/** The video to open for an exercise: a pin from the app, else one set in the exercise data. */
export function pinnedVideo(ex: Exercise, videos: Record<string, { url: string }>): string | undefined {
  const pin = videos[ex.id];
  return pin ? pin.url || undefined : ex.video;
}

/**
 * How to do an exercise: a short written guide that works offline, its muscles, and a video —
 * a pinned link, or a YouTube search for "<name> form".
 */
export function HowToSheet({ ex, onClose }: { ex: Exercise; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const howto = howToFor(ex);
  const video = pinnedVideo(ex, state.videos);
  const [pinning, setPinning] = useState(false);
  const [link, setLink] = useState(video ?? '');
  const clean = cleanVideoUrl(link);

  const pin = (url: string) => {
    dispatch({ type: 'videoPin', exerciseId: ex.id, url, now: new Date().toISOString() });
    setPinning(false);
  };
  const muscles = [...ex.primary, ...ex.secondary].map((m) => MUSCLE_LABELS[m]);

  return (
    <Sheet title={ex.name} onClose={onClose}>
      <div className="howto-head">
        <BodyMap load={exerciseMap(ex)} scaleMax={1} size="mini" />
        <div className="howto-meta">
          <div>{ex.equipment}</div>
          {!!muscles.length && <div className="dim">{muscles.join(', ')}</div>}
        </div>
      </div>

      {howto ? (
        <>
          <ol className="howto-steps">
            {howto.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          {howto.mistake && (
            <div className="howto-mistake">
              <span className="howto-mistake-label">Common mistake</span>
              {howto.mistake}
            </div>
          )}
        </>
      ) : (
        <p className="dim howto-none">No written guide for this one yet — the video search below will find it.</p>
      )}
      {ex.cue && <div className="howto-cue">Your cue: {ex.cue}</div>}

      <div className="stack howto-actions">
        <a className="btn btn-block btn-lg btn-primary" href={video ?? youtubeSearchUrl(ex.name)} target="_blank" rel="noopener noreferrer">
          {video ? 'Watch your video' : 'Watch on YouTube'}
        </a>
        {video && (
          <a className="btn btn-block" href={youtubeSearchUrl(ex.name)} target="_blank" rel="noopener noreferrer">
            Search YouTube instead
          </a>
        )}
        {pinning ? (
          <div className="howto-pin">
            <input
              className="input"
              type="url"
              inputMode="url"
              placeholder="Paste a YouTube link"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              autoFocus
            />
            <div className="row">
              <button className="btn grow" onClick={() => setPinning(false)}>
                Cancel
              </button>
              <button className="btn btn-primary grow" disabled={!clean} onClick={() => clean && pin(clean)}>
                Pin video
              </button>
            </div>
          </div>
        ) : (
          <div className="row">
            <button className="btn grow" onClick={() => setPinning(true)}>
              {video ? 'Change video' : 'Pin a video'}
            </button>
            {video && (
              <button className="btn grow" onClick={() => pin('')}>
                Remove pin
              </button>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}
