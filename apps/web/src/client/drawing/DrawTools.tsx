import { notesStrings } from '../notes/strings.ts';
import type { DrawingKind } from './geometry.ts';

const TOOLS: DrawingKind[] = ['line', 'arrow', 'angle'];

interface DrawToolsProps {
  tool: DrawingKind | null;
  onTool: (tool: DrawingKind | null) => void;
}

/** Line, arrow, angle (#60): in the player's toolbar, right under the picture they draw on. */
export function DrawTools({ tool, onTool }: DrawToolsProps) {
  const t = notesStrings();
  return (
    <div className="draw" role="group" aria-label={t.draw}>
      <div className="draw__tools">
        <span className="draw__title">{t.draw}</span>
        {TOOLS.map((kind) => (
          <button
            key={kind}
            type="button"
            className="button--quiet"
            aria-pressed={tool === kind}
            onClick={() => {
              onTool(tool === kind ? null : kind);
            }}
          >
            {t.tools[kind]}
          </button>
        ))}
      </div>
      <p className="muted draw__hint" role="status">
        {tool === null ? '' : t.hints[tool]}
      </p>
    </div>
  );
}
