import { useEffect, useRef } from 'react';
import { lang } from '../i18n/language.ts';

const labels = {
  en: { yes: 'Yes, delete', no: 'Cancel', short: { yes: 'Yes', no: 'No' } },
  nl: { yes: 'Ja, verwijderen', no: 'Annuleren', short: { yes: 'Ja', no: 'Nee' } },
};

interface ConfirmInlineProps {
  question: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Small, for inside a chip: "Ja" / "Nee". */
  compact?: boolean;
  /** For confirmations that don't delete, e.g. "Ja, samenvoegen". */
  yesLabel?: string;
}

/**
 * A confirmation in the page where the action was asked for, instead of a browser popup (Ewout,
 * 2026-11-01). The confirm button takes the focus; Escape cancels. Clicks don't reach the
 * surrounding section (which would seek the video).
 */
export function ConfirmInline({
  question,
  onConfirm,
  onCancel,
  compact = false,
  yesLabel,
}: ConfirmInlineProps) {
  const l = labels[lang()];
  const yes = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    yes.current?.focus();
  }, []);

  return (
    <div
      className={`confirm${compact ? ' confirm--compact' : ''}`}
      role="group"
      aria-label={question}
      data-testid="confirm"
      onClick={(e) => {
        e.stopPropagation();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <span className="confirm__question">{question}</span>
      <span className="confirm__actions">
        <button ref={yes} type="button" className="confirm__yes" onClick={onConfirm}>
          {yesLabel ?? (compact ? l.short.yes : l.yes)}
        </button>
        <button type="button" className="button--quiet" onClick={onCancel}>
          {compact ? l.short.no : l.no}
        </button>
      </span>
    </div>
  );
}
