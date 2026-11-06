import type { StrokeMark, StrokeMarkKind } from '../../shared/strokes.ts';
import { Icon } from '../ui/icons.tsx';
import { PressButton } from '../ui/PressButton.tsx';
import { strokeStrings } from './strings.ts';

/** Quick frame actions next to the picture, also available when the notes tab is open. */
export function StrokeFrameTools({
  frame,
  marks,
  busy,
  onMark,
}: {
  frame: number;
  marks: readonly StrokeMark[];
  busy: boolean;
  onMark: (kind: StrokeMarkKind) => void;
}) {
  const t = strokeStrings();
  return (
    <div
      className="stroke-frame-tools"
      role="group"
      aria-label={t.mark}
      data-testid="stroke-frame-tools"
    >
      {(['catch', 'finish'] as const).map((kind) => (
        <PressButton
          key={kind}
          className="button--quiet"
          disabled={busy}
          aria-pressed={marks.some((mark) => mark.frame === frame && mark.kind === kind)}
          aria-keyshortcuts={t.keys[kind]}
          onPress={() => {
            onMark(kind);
          }}
        >
          <Icon name={kind === 'catch' ? 'arrowDown' : 'arrowUp'} size={18} />
          {t.kinds[kind]}
        </PressButton>
      ))}
    </div>
  );
}
