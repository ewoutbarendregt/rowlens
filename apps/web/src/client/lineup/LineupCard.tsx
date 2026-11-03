import { useEffect, useId, useState } from 'react';
import {
  BOAT_CLASSES,
  BOAT_CLASS_NAMES,
  type BoatClass,
  seatRole,
  seatsOf,
} from '../../shared/boats.ts';
import { api } from '../api.ts';
import { RowerPicker } from '../rowers/RowerPicker.tsx';
import { useRoster } from '../rowers/useRoster.ts';
import { formatDate } from '../sessions/strings.ts';
import { lineupStrings } from './strings.ts';

export interface LineupSeat {
  seat: number;
  rower: { id: string; displayName: string; archived: boolean };
}

interface RecentLineup {
  id: string;
  title: string;
  date: string;
  boatType: BoatClass;
  lineup: LineupSeat[];
}

type Seats = ReadonlyMap<number, LineupSeat['rower']>;

const toMap = (lineup: LineupSeat[]): Seats => new Map(lineup.map((s) => [s.seat, s.rower]));

const sameSeats = (a: Seats, b: Seats) =>
  a.size === b.size && [...a].every(([seat, rower]) => b.get(seat)?.id === rower.id);

interface LineupCardProps {
  sessionId: string;
  boatType: BoatClass | null;
  lineup: LineupSeat[];
  onSaved: (boatType: BoatClass | null, lineup: LineupSeat[]) => void;
}

/**
 * Who sat where in this session (#103): choose the boat, then a rower per seat from the club roster
 * (or add one on the spot), or copy an earlier lineup. Saved as a whole with one button.
 */
export function LineupCard({ sessionId, boatType, lineup, onSaved }: LineupCardProps) {
  const t = lineupStrings();
  const id = useId();
  const roster = useRoster();
  const [boat, setBoat] = useState<BoatClass | null>(boatType);
  const [seats, setSeats] = useState<Seats>(() => toMap(lineup));
  const [recent, setRecent] = useState<RecentLineup[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<'saved' | 'failed' | 'archived' | null>(null);

  // Back to the saved lineup when it changes on the server (a save here, or another device's);
  // not on every reload of the page's data, which happens every few seconds while videos process.
  const savedKey = `${boatType ?? ''}|${lineup.map((s) => `${String(s.seat)}:${s.rower.id}`).join(',')}`;
  const [syncedKey, setSyncedKey] = useState(savedKey);
  if (syncedKey !== savedKey) {
    setSyncedKey(savedKey);
    setBoat(boatType);
    setSeats(toMap(lineup));
  }

  useEffect(() => {
    void api(`/api/lineups/recent?except=${sessionId}`)
      .then((res) => (res.ok ? (res.json() as Promise<{ sessions: RecentLineup[] }>) : null))
      .then((body) => {
        setRecent(body?.sessions ?? []);
      })
      .catch(() => {
        setRecent([]);
      });
  }, [sessionId]);

  const dirty = boat !== boatType || !sameSeats(seats, toMap(lineup));
  const taken = new Set([...seats.values()].map((r) => r.id));
  const active = (roster.rowers ?? []).filter((r) => r.archivedAt === null);

  const chooseBoat = (next: BoatClass | null) => {
    setStatus(null);
    setBoat(next);
    // Keep whoever sits in a seat the new boat also has.
    const allowed = new Set(next === null ? [] : seatsOf(next));
    setSeats((current) => new Map([...current].filter(([seat]) => allowed.has(seat))));
  };

  const setSeat = (seat: number, rower: LineupSeat['rower'] | null) => {
    setStatus(null);
    setSeats((current) => {
      const next = new Map(current);
      if (rower === null) next.delete(seat);
      else next.set(seat, rower);
      return next;
    });
  };

  const copy = (from: RecentLineup) => {
    setStatus(null);
    setBoat(from.boatType);
    // Archived rowers can't be seated anew, so they're left out of the copy.
    setSeats(toMap(from.lineup.filter((s) => !s.rower.archived)));
  };

  const save = async () => {
    setBusy(true);
    setStatus(null);
    const res = await api(`/api/sessions/${sessionId}/lineup`, {
      method: 'PUT',
      body: {
        boatType: boat,
        seats: [...seats].map(([seat, rower]) => ({ seat, rowerId: rower.id })),
      },
    }).catch(() => null);
    setBusy(false);
    if (res?.ok === true) {
      const body = (await res.json()) as { boatType: BoatClass | null; lineup: LineupSeat[] };
      setStatus('saved');
      onSaved(body.boatType, body.lineup);
      return;
    }
    const error =
      res?.status === 400 ? ((await res.json()) as { error?: string }).error : undefined;
    setStatus(error === 'archived_rower' ? 'archived' : 'failed');
  };

  const coastal = BOAT_CLASS_NAMES.filter((b) => BOAT_CLASSES[b].coastal);
  const flat = BOAT_CLASS_NAMES.filter((b) => !BOAT_CLASSES[b].coastal);

  return (
    <section className="card form lineup" aria-labelledby={`${id}-h`} data-testid="lineup">
      <h2 id={`${id}-h`}>{t.lineup}</h2>
      <div className="lineup__boat">
        <label htmlFor={`${id}-boat`}>{t.boat}</label>
        <select
          id={`${id}-boat`}
          value={boat ?? ''}
          onChange={(e) => {
            chooseBoat(e.target.value === '' ? null : (e.target.value as BoatClass));
          }}
        >
          <option value="">{t.chooseBoat}</option>
          <optgroup label={t.coastal}>
            {coastal.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </optgroup>
          <optgroup label={t.flatWater}>
            {flat.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </optgroup>
        </select>
        {recent !== null && recent.length > 0 && (
          <select
            aria-label={t.copyFrom}
            value=""
            onChange={(e) => {
              const from = recent.find((r) => r.id === e.target.value);
              if (from !== undefined) copy(from);
            }}
          >
            <option value="">{t.copyFrom}…</option>
            {recent.map((r) => (
              <option key={r.id} value={r.id}>
                {formatDate(r.date)} · {r.title} · {r.boatType}
              </option>
            ))}
          </select>
        )}
      </div>

      {boat === null ? (
        <p className="muted">{t.empty}</p>
      ) : (
        <ol className="lineup__seats">
          {seatsOf(boat).map((seat) => {
            const role = seatRole(boat, seat);
            const rower = seats.get(seat) ?? null;
            return (
              <li key={seat} data-testid="seat">
                <span className="lineup__seat" aria-hidden="true">
                  {t.seat(role, seat)}
                </span>
                <RowerPicker
                  label={t.seatLabel(role, seat)}
                  rowers={active}
                  value={rower}
                  unavailable={new Set([...taken].filter((r) => r !== rower?.id))}
                  onChange={(r) => {
                    setSeat(
                      seat,
                      r === null ? null : { id: r.id, displayName: r.displayName, archived: false },
                    );
                  }}
                  onAdded={() => void roster.reload()}
                />
              </li>
            );
          })}
        </ol>
      )}

      {dirty && (
        <span className="lineup__actions">
          <button type="button" disabled={busy} onClick={() => void save()}>
            {t.save}
          </button>
          <button
            type="button"
            className="button--quiet"
            disabled={busy}
            onClick={() => {
              setStatus(null);
              setBoat(boatType);
              setSeats(toMap(lineup));
            }}
          >
            {t.cancel}
          </button>
        </span>
      )}
      {status === 'saved' && !dirty && <p role="status">{t.saved}</p>}
      {status === 'failed' && <p role="alert">{t.failed}</p>}
      {status === 'archived' && <p role="alert">{t.archivedRower}</p>}
    </section>
  );
}

/**
 * The lineup in the video page's header (mockup 1e): one column per seat, the seat above the name,
 * bow to stroke and the cox last, after the boat.
 */
export function LineupSummary({
  boatType,
  lineup,
}: {
  boatType: BoatClass | null;
  lineup: LineupSeat[];
}) {
  const t = lineupStrings();
  if (boatType === null || lineup.length === 0) return null;
  // Seat 0 is the cox: after the rowers.
  const seats = [...lineup].sort((a, b) => (a.seat || 99) - (b.seat || 99));
  return (
    <dl className="lineup-cols" data-testid="lineup-summary" aria-label={t.lineup}>
      <div>
        <dt>{t.boat}</dt>
        <dd>{boatType}</dd>
      </div>
      {seats.map((s) => (
        <div key={s.seat}>
          <dt>{t.seat(seatRole(boatType, s.seat), s.seat)}</dt>
          <dd>{s.rower.displayName}</dd>
        </div>
      ))}
    </dl>
  );
}
