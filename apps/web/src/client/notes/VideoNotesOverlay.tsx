import { overlayPosition, type OverlayMoment } from './overlay.ts';

/** Read-only notes inside the picture; drawings are rendered by the shared SVG layer. */
export function VideoNotesOverlay({ moment }: { moment: OverlayMoment }) {
  if (moment.notes.length === 0) return null;
  const position = overlayPosition(moment);
  return (
    <div
      className={`video-note-overlay video-note-overlay--${position}`}
      data-testid="video-note-overlay"
      aria-live="off"
    >
      {moment.notes.map((note) => (
        <div key={note.id} className="video-note-overlay__note">
          <strong>{note.authorName}</strong>
          <p>{note.body}</p>
        </div>
      ))}
    </div>
  );
}
