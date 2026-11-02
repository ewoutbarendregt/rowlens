import { type KeyboardEvent, useId, useState } from 'react';
import { nameMatches, normalizeName } from '../../shared/names.ts';
import { rowerStrings } from './strings.ts';
import { addRower, type Rower } from './useRoster.ts';

const MAX_OPTIONS = 8;

interface RowerPickerProps {
  /** The active roster to search in. */
  rowers: Rower[];
  value: { id: string; displayName: string } | null;
  onChange: (rower: Rower | null) => void;
  /** A rower was added from the picker: the parent reloads its roster. */
  onAdded: (rower: Rower) => void;
  /** Accessible name of the field, e.g. "Seat 2". */
  label: string;
  /** Rowers that can't be picked here (already in another seat). */
  unavailable?: ReadonlySet<string>;
  /** Shown first, with a hint (e.g. the session lineup with seats, #105). */
  suggested?: readonly { id: string; label: string }[];
}

type Option = { kind: 'rower'; rower: Rower } | { kind: 'add'; name: string };

/**
 * Search-as-you-type choice of a rower from the club roster (#104), with "add ‘name’" at the bottom
 * so a coach can fill a lineup on the jetty without leaving the page. A name that looks like an
 * existing rower asks first (the API answers 409 with candidates). Used by lineups (#103) and later
 * by note assignment (#105) and sharing (#112).
 */
export function RowerPicker({
  rowers,
  value,
  onChange,
  onAdded,
  label,
  unavailable,
  suggested,
}: RowerPickerProps) {
  const t = rowerStrings();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [similar, setSimilar] = useState<{ name: string; candidates: Rower[] } | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const trimmed = query.trim();
  const hint = new Map((suggested ?? []).map((s, i) => [s.id, { label: s.label, order: i }]));
  const matches = rowers
    .filter((r) => nameMatches(r.displayName, query))
    // Suggested rowers first, in their own order; the rest keep the roster's (name) order.
    .map((r, i) => ({ r, key: hint.get(r.id)?.order ?? hint.size + i }))
    .sort((a, b) => a.key - b.key)
    .map(({ r }) => r)
    .slice(0, MAX_OPTIONS);
  const exact = rowers.some((r) => normalizeName(r.displayName) === normalizeName(trimmed));
  const options: Option[] = [
    ...matches.map((rower) => ({ kind: 'rower' as const, rower })),
    ...(trimmed !== '' && !exact ? [{ kind: 'add' as const, name: trimmed }] : []),
  ];
  const isUnavailable = (o: Option) => o.kind === 'rower' && unavailable?.has(o.rower.id) === true;

  const close = () => {
    setOpen(false);
    setQuery('');
    setActive(0);
  };

  const choose = (rower: Rower) => {
    onChange(rower);
    setSimilar(null);
    close();
  };

  const add = async (name: string, confirmNew: boolean) => {
    setBusy(true);
    setError(false);
    const result = await addRower(name, { confirmNew });
    setBusy(false);
    if (result.kind === 'added') {
      onAdded(result.rower);
      choose(result.rower);
    } else if (result.kind === 'similar') {
      setSimilar({ name, candidates: result.candidates });
      close();
    } else {
      setError(true);
    }
  };

  const pick = (option: Option) => {
    if (isUnavailable(option)) return;
    if (option.kind === 'rower') choose(option.rower);
    else void add(option.name, false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (options.length === 0 ? 0 : (i + step + options.length) % options.length));
    } else if (e.key === 'Enter' && open) {
      e.preventDefault();
      const option = options[active];
      if (option !== undefined) pick(option);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      close();
    }
  };

  return (
    <div className="picker">
      <div className="picker__field">
        <input
          id={`${id}-input`}
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={
            open && options.length > 0 ? `${id}-opt-${String(active)}` : undefined
          }
          autoComplete="off"
          enterKeyHint="done"
          placeholder={t.typeToAdd}
          value={open ? query : (value?.displayName ?? '')}
          disabled={busy}
          onFocus={() => {
            setOpen(true);
            setQuery('');
            setActive(0);
          }}
          onBlur={close}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
        {value !== null && !open && (
          <button
            type="button"
            className="picker__clear button--quiet"
            aria-label={t.clear(value.displayName)}
            onClick={() => {
              onChange(null);
            }}
          >
            ×
          </button>
        )}
      </div>
      {open && options.length > 0 && (
        <ul className="picker__list" id={`${id}-list`} role="listbox" aria-label={label}>
          {options.map((option, i) => (
            <li
              key={option.kind === 'rower' ? option.rower.id : 'add'}
              id={`${id}-opt-${String(i)}`}
              role="option"
              aria-selected={i === active}
              aria-disabled={isUnavailable(option) || undefined}
              className={option.kind === 'add' ? 'picker__add' : undefined}
              // Mouse down, not click: the input's blur would close the list first.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(option);
              }}
            >
              {option.kind === 'add' ? (
                `＋ ${t.addNamed(option.name)}`
              ) : (
                <>
                  {option.rower.displayName}
                  {hint.has(option.rower.id) && (
                    <span className="muted"> · {hint.get(option.rower.id)?.label}</span>
                  )}
                  {isUnavailable(option) && <span className="muted"> · {t.inUse}</span>}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {similar !== null && (
        <div className="picker__similar" role="group" aria-label={t.similar(similar.name)}>
          <p>{t.similar(similar.name)}</p>
          {similar.candidates.map((c) => (
            <button
              key={c.id}
              type="button"
              // An archived rower can't go in a new lineup; restore them on the Rowers page first.
              disabled={unavailable?.has(c.id) === true || c.archivedAt !== null}
              onClick={() => {
                choose(c);
              }}
            >
              {t.useExisting(c.displayName)}
              {c.archivedAt !== null && ` (${t.archived})`}
            </button>
          ))}
          <button
            type="button"
            className="button--quiet"
            disabled={busy}
            onClick={() => {
              void add(similar.name, true);
            }}
          >
            {t.addAnyway}
          </button>
        </div>
      )}
      {error && <p role="alert">{t.failed}</p>}
    </div>
  );
}
