import { describe, expect, it } from 'vitest';
import {
  activeVideoMoment,
  NOTE_HOLD_KEY,
  NOTES_VISIBLE_KEY,
  overlayPosition,
  rememberNoteHoldSeconds,
  rememberNotesVisible,
  storedNoteHoldSeconds,
  storedNotesVisible,
  videoMoments,
  type OverlayAnnotation,
} from './overlay.ts';

function annotation(
  id: string,
  frame: number,
  kind: 'note' | 'line' = 'note',
  points: [number, number][] = [],
): OverlayAnnotation {
  return {
    id,
    frame,
    kind,
    body: kind === 'note' ? `Note ${id}` : '',
    authorName: 'Coach',
    shape: kind === 'note' ? null : { points },
  };
}

describe('notes in the video (#106)', () => {
  it('groups and filters moments, then holds the latest for one second', () => {
    const all = videoMoments(
      [annotation('a', 10), annotation('line', 10, 'line'), annotation('b', 40)],
      null,
    );
    expect(all.map((m) => m.frame)).toEqual([10, 40]);
    expect(activeVideoMoment(all, 9, 30)).toBeNull();
    expect(activeVideoMoment(all, 10, 30)?.frame).toBe(10);
    expect(activeVideoMoment(all, 39, 30)?.frame).toBe(10);
    expect(activeVideoMoment(all, 40, 30)?.frame).toBe(40);
    expect(activeVideoMoment(all, 70, 30)).toBeNull();
    expect(videoMoments([annotation('a', 10), annotation('b', 40)], new Set([40]))).toHaveLength(1);
  });

  it('places text away from a drawing', () => {
    const [topLeft] = videoMoments(
      [
        annotation('line', 10, 'line', [
          [0.05, 0.05],
          [0.25, 0.2],
        ]),
      ],
      null,
    );
    const [bottomRight] = videoMoments(
      [
        annotation('line', 10, 'line', [
          [0.75, 0.75],
          [0.95, 0.95],
        ]),
      ],
      null,
    );
    expect(topLeft === undefined ? null : overlayPosition(topLeft)).toBe('bottom-right');
    expect(bottomRight === undefined ? null : overlayPosition(bottomRight)).toBe('top-left');
  });

  it('remembers the toggle and survives unavailable storage', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    expect(storedNotesVisible(storage)).toBe(true);
    rememberNotesVisible(false, storage);
    expect(values.get(NOTES_VISIBLE_KEY)).toBe('off');
    expect(storedNotesVisible(storage)).toBe(false);
    expect(storedNoteHoldSeconds(storage)).toBe(1);
    rememberNoteHoldSeconds(2, storage);
    expect(values.get(NOTE_HOLD_KEY)).toBe('2');
    expect(storedNoteHoldSeconds(storage)).toBe(2);
    expect(
      storedNotesVisible({
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => undefined,
      }),
    ).toBe(true);
  });
});
