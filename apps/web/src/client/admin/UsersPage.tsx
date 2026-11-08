import { admissionStrings } from './admission-strings.ts';
import { registrationStrings } from '../auth/registration-strings.ts';
import { lang } from '../i18n/language.ts';
import { useEffect, useRef, useState } from 'react';
import {
  DIRECTORY_FIELDS,
  directoryRowSchema,
  directoryValue,
  type DirectoryField,
  type DirectoryQuery,
  type DirectoryRow,
} from '../../shared/user-directory.ts';
import { api } from '../api.ts';
import { useAuth } from '../auth/useAuth.ts';
import { adminStrings } from './strings.ts';
import { directoryStrings } from './directory-strings.ts';
import { UserEditor } from './UserEditor.tsx';
import { LANGUAGE_NAMES, locale } from '../i18n/language.ts';
import { settingsStrings } from '../settings/strings.ts';
import { BOAT_CLASS_NAMES } from '../../shared/boats.ts';
import { clubStrings } from '../clubs/strings.ts';
const DEFAULT_COLUMNS: DirectoryField[] = [
  'firstName',
  'lastName',
  'email',
  'platformAdmin',
  'clubs',
  'roles',
  'status',
];
const initial: DirectoryQuery = {
  filters: [],
  sort: 'lastName',
  desc: false,
  page: 0,
  pageSize: 25,
};
export function UsersPage() {
  const { state } = useAuth();
  const scope =
    state.kind === 'open'
      ? `${state.user.id}:${state.club.id ?? ''}:${String(state.user.platformAdmin === true)}`
      : state.kind;
  return <UsersDirectory key={scope} />;
}
function UsersDirectory() {
  const t = directoryStrings(),
    a = adminStrings(),
    c = clubStrings();
  const { state } = useAuth();
  const [query, setQuery] = useState<DirectoryQuery>(initial),
    [draft, setDraft] = useState<DirectoryQuery['filters']>([]),
    [columns, setColumns] = useState<DirectoryField[]>(DEFAULT_COLUMNS);
  const [clubOptions, setClubOptions] = useState<{ id: string; name: string }[]>([]);
  const [result, setResult] = useState<{ rows: DirectoryRow[]; total: number }>({
      rows: [],
      total: 0,
    }),
    [failed, setFailed] = useState(false),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0);
  const [selected, setSelected] = useState<DirectoryRow | null>(null),
    [tab, setTab] = useState<'users' | 'requests'>('users');
  const [requests, setRequests] = useState<
      {
        id: string;
        kind: 'club' | 'registration' | 'clubless';
        clubId: string | null;
        clubName: string | null;
        name: string;
        email: string;
        createdAt: string;
        status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'registered';
        archived: boolean;
      }[]
    >([]),
    [requestBusy, setRequestBusy] = useState(false);
  const generation = useRef(0);
  const actor = state.kind === 'open' ? state.user.id : null,
    club = state.kind === 'open' ? state.club.id : null;
  const platform = state.kind === 'open' && !!state.user.platformAdmin;
  useEffect(() => {
    const ticket = ++generation.current;
    setLoading(true);
    setFailed(false);
    void Promise.all([
      api('/api/manage/users/query', { method: 'POST', body: query }),
      api('/api/manage/applications'),
      api('/api/account/clubless-requests', { clubId: null }),
    ])
      .then(async (rs) => {
        if (rs.some((r) => !r.ok)) throw new Error();
        const [raw, pending, clubless] = (await Promise.all(rs.map((r) => r.json()))) as [
          { rows: unknown[]; total: number; clubs: { id: string; name: string }[] },
          typeof requests,
          typeof requests,
        ];
        if (ticket !== generation.current) return;
        setResult({ rows: directoryRowSchema.array().parse(raw.rows), total: raw.total });
        setRequests([
          ...pending.filter(
            (r) =>
              !(
                r.kind === 'registration' &&
                r.clubId === null &&
                clubless.some((c) => c.email === r.email)
              ),
          ),
          ...clubless,
        ]);
        setClubOptions(raw.clubs);
        if (query.page > 0 && query.page * query.pageSize >= raw.total)
          setQuery((q) => ({ ...q, page: Math.max(0, Math.ceil(raw.total / q.pageSize) - 1) }));
        setLoading(false);
      })
      .catch(() => {
        if (ticket === generation.current) {
          setFailed(true);
          setLoading(false);
        }
      });
    return () => {
      generation.current++;
    };
  }, [query, actor, club, platform, version]);
  const refresh = async () => {
    if (selected) {
      const r = await api(`/api/manage/users/${selected.id}`);
      if (!r.ok) {
        setSelected(null);
        setFailed(true);
      } else setSelected(directoryRowSchema.parse(await r.json()));
    }
    setVersion((v) => v + 1);
  };
  const display = (row: DirectoryRow, field: DirectoryField) => {
    const v = directoryValue(row, field);
    if ((field === 'clubs' || field === 'roles') && v === '') return t.none;
    if (v === null || v === '') return t.unknown;
    if (typeof v === 'boolean') return v ? t.yes : t.no;
    if (field === 'roles')
      return (
        row.memberships.map((m) => m.roles.map((r) => a.roles[r]).join(', ')).join(' · ') || t.none
      );
    if (field === 'status')
      return String(v)
        .split(', ')
        .map((s) => (s === 'member' ? t.active : s === 'pending' ? t.pending : t.none))
        .join(', ');
    if (['createdAt', 'verifiedAt', 'lastSeenAt'].includes(field))
      return new Date(String(v)).toLocaleString(locale());
    return String(v);
  };
  const choices = (
    field: DirectoryField,
  ): { value: string | number | boolean | null; label: string }[] | null => {
    const prefs = settingsStrings();
    if (['platformAdmin', 'notesVisible', 'driveMiddle'].includes(field))
      return [
        { value: null, label: t.unknown },
        { value: true, label: t.yes },
        { value: false, label: t.no },
      ];
    if (field === 'clubs')
      return [
        { value: null, label: t.none },
        ...clubOptions.map((c) => ({ value: c.id, label: c.name })),
      ];
    if (field === 'roles')
      return (['rower', 'coach', 'admin'] as const).map((value) => ({
        value,
        label: a.roles[value],
      }));
    if (field === 'status')
      return [
        { value: 'member', label: t.active },
        { value: 'pending', label: t.pending },
        { value: 'none', label: t.none },
      ];
    if (field === 'language')
      return [
        { value: null, label: t.unknown },
        { value: 'nl', label: LANGUAGE_NAMES.nl },
        { value: 'en', label: LANGUAGE_NAMES.en },
      ];
    if (field === 'theme')
      return [
        { value: null, label: t.unknown },
        ...(['light', 'dark', 'hc'] as const).map((value) => ({
          value,
          label: prefs.themes[value],
        })),
      ];
    if (field === 'defaultBoatType')
      return [
        { value: null, label: t.unknown },
        ...BOAT_CLASS_NAMES.map((value) => ({ value, label: value })),
      ];
    if (field === 'noteHoldSeconds')
      return [
        { value: null, label: t.unknown },
        ...[0.5, 1, 2].map((value) => ({ value, label: prefs.seconds(value) })),
      ];
    return null;
  };
  const operators = (field: DirectoryField): DirectoryQuery['filters'][number]['op'][] =>
    ['createdAt', 'verifiedAt', 'lastSeenAt', 'noteHoldSeconds'].includes(field)
      ? ['eq', 'gte', 'lte', 'isNull']
      : choices(field)
        ? ['eq', 'isNull']
        : ['contains', 'eq', 'isNull'];
  const sort = (field: DirectoryField) => {
    setQuery((q) => ({ ...q, sort: field, desc: q.sort === field ? !q.desc : false, page: 0 }));
  };
  const updateFilter = (index: number, patch: Partial<DirectoryQuery['filters'][number]>) => {
    setDraft((fs) => fs.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  };
  return (
    <main className="page page--wide users-directory club-admin-page">
      <h1>{t.title}</h1>
      <p>{platform ? t.globalScope : t.clubScope}</p>
      {selected ? (
        <UserEditor
          key={selected.id}
          user={selected}
          onChanged={refresh}
          onBack={() => {
            setSelected(null);
            setVersion((v) => v + 1);
          }}
        />
      ) : (
        <>
          <div className="tabs" role="tablist" aria-label={t.title}>
            {(['users', 'requests'] as const).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                className="tabs__tab"
                onClick={() => {
                  setTab(key);
                }}
              >
                {key === 'users' ? t.title : t.requests}
              </button>
            ))}
          </div>
          {failed && <p role="alert">{t.failed}</p>}
          {loading && <p role="status">{t.loading}</p>}
          {tab === 'requests' ? (
            <section>
              <h2>{t.requests}</h2>
              {!loading && !requests.length && <p>{c.empty}</p>}
              {requests.map((r) => (
                <article
                  key={`${r.kind}:${r.id}`}
                  className="card"
                  data-testid="registration-request"
                >
                  <h3>{r.name || r.email}</h3>
                  <p>
                    {r.email} · {r.clubName ?? registrationStrings().noClub}
                  </p>
                  <p>
                    {r.kind === 'club'
                      ? registrationStrings().clubApplication
                      : registrationStrings().accountRegistration}{' '}
                    ·{' '}
                    {r.status === 'registered'
                      ? registrationStrings().registeredStatus
                      : r.kind === 'clubless' && r.status !== 'cancelled'
                        ? admissionStrings()[r.status]
                        : c[r.status]}
                    {r.archived ? ` · ${c.archived}` : ''}
                  </p>
                  <p>
                    {registrationStrings().date}:{' '}
                    <time dateTime={r.createdAt}>
                      {new Date(r.createdAt).toLocaleString(lang() === 'en' ? 'en-GB' : 'nl-NL')}
                    </time>
                  </p>
                  {(r.kind === 'club' || r.kind === 'clubless') &&
                    r.status === 'pending' &&
                    !r.archived &&
                    (r.clubId || platform) && (
                      <div className="club-actions">
                        {[true, false].map((approve) => (
                          <button
                            key={String(approve)}
                            disabled={requestBusy}
                            onClick={() => {
                              setRequestBusy(true);
                              void api(
                                r.kind === 'clubless'
                                  ? `/api/account/clubless-requests/${r.id}`
                                  : `/api/admin/applications/${r.id}`,
                                {
                                  method: 'POST',
                                  body: { approve },
                                  clubId: r.clubId,
                                },
                              )
                                .then((response) => {
                                  if (!response.ok) throw new Error();
                                  setVersion((v) => v + 1);
                                })
                                .catch(() => {
                                  setFailed(true);
                                })
                                .finally(() => {
                                  setRequestBusy(false);
                                });
                            }}
                          >
                            {r.kind === 'clubless'
                              ? approve
                                ? admissionStrings().accept
                                : admissionStrings().reject
                              : approve
                                ? c.approve
                                : c.reject}
                          </button>
                        ))}
                      </div>
                    )}
                </article>
              ))}
            </section>
          ) : (
            <>
              <details className="card user-columns">
                <summary>{t.columns}</summary>
                <div className="role-choices">
                  {DIRECTORY_FIELDS.map((field) => (
                    <label key={field}>
                      <input
                        type="checkbox"
                        checked={columns.includes(field)}
                        onChange={(e) => {
                          setColumns((cols) =>
                            e.target.checked
                              ? DIRECTORY_FIELDS.filter((f) => cols.includes(f) || f === field)
                              : cols.filter((f) => f !== field),
                          );
                        }}
                      />
                      {t.fields[field]}
                    </label>
                  ))}
                </div>
              </details>
              <form
                className="card form user-filters"
                aria-label={t.filter}
                onSubmit={(e) => {
                  e.preventDefault();
                  setQuery((q) => ({
                    ...q,
                    filters: draft.map((f) => ({
                      ...f,
                      value:
                        ['createdAt', 'verifiedAt', 'lastSeenAt'].includes(f.field) &&
                        typeof f.value === 'string' &&
                        f.value !== ''
                          ? new Date(f.value).toISOString()
                          : f.value,
                    })),
                    page: 0,
                  }));
                }}
              >
                {draft.map((filter, i) => (
                  <div className="user-filter" key={i}>
                    <label>
                      {t.field}
                      <select
                        aria-label={`${t.field} ${String(i + 1)}`}
                        value={filter.field}
                        onChange={(e) => {
                          const field = e.target.value as DirectoryField;
                          const opts = choices(field);
                          updateFilter(i, {
                            field,
                            value: opts?.[0]?.value ?? (opts ? null : ''),
                            op: opts
                              ? 'eq'
                              : ['createdAt', 'verifiedAt', 'lastSeenAt'].includes(field)
                                ? 'gte'
                                : 'contains',
                          });
                        }}
                      >
                        {DIRECTORY_FIELDS.map((field) => (
                          <option key={field} value={field}>
                            {t.fields[field]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {t.operator}
                      <select
                        aria-label={`${t.operator} ${String(i + 1)}`}
                        value={filter.op}
                        onChange={(e) => {
                          updateFilter(i, { op: e.target.value as typeof filter.op });
                        }}
                      >
                        {operators(filter.field).map((op) => (
                          <option key={op} value={op}>
                            {t[op]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {t.value}
                      {filter.op === 'isNull' ? (
                        <span>{t.unknown}</span>
                      ) : choices(filter.field) ? (
                        <select
                          aria-label={`${t.value} ${String(i + 1)}`}
                          value={String(filter.value)}
                          onChange={(e) => {
                            const option = choices(filter.field)?.find(
                              (o) => String(o.value) === e.target.value,
                            );
                            updateFilter(i, { op: 'eq', value: option?.value ?? null });
                          }}
                        >
                          {choices(filter.field)?.map((option) => (
                            <option key={String(option.value)} value={String(option.value)}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          aria-label={`${t.value} ${String(i + 1)}`}
                          type={
                            ['createdAt', 'verifiedAt', 'lastSeenAt'].includes(filter.field)
                              ? 'datetime-local'
                              : 'text'
                          }
                          step={
                            ['createdAt', 'verifiedAt', 'lastSeenAt'].includes(filter.field)
                              ? 0.001
                              : undefined
                          }
                          value={String(filter.value ?? '')}
                          onChange={(e) => {
                            updateFilter(i, {
                              value:
                                filter.field === 'noteHoldSeconds' && e.target.value !== ''
                                  ? Number(e.target.value)
                                  : e.target.value,
                            });
                          }}
                        />
                      )}
                    </label>
                    <button
                      type="button"
                      className="button--quiet"
                      aria-label={`${t.removeFilter} ${String(i + 1)}`}
                      onClick={() => {
                        setDraft((fs) => fs.filter((_, j) => j !== i));
                      }}
                    >
                      {t.removeFilter}
                    </button>
                  </div>
                ))}
                <div className="club-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setDraft((fs) => [...fs, { field: 'email', op: 'contains', value: '' }]);
                    }}
                  >
                    {t.addFilter}
                  </button>
                  <button type="submit">{t.apply}</button>
                  <button
                    type="button"
                    className="button--quiet"
                    onClick={() => {
                      setDraft([]);
                      setQuery((q) => ({ ...q, filters: [], page: 0 }));
                    }}
                  >
                    {t.clear}
                  </button>
                </div>
              </form>
              <div className="user-sort">
                <label>
                  {t.sort}
                  <select
                    aria-label={t.sort}
                    value={query.sort}
                    onChange={(e) => {
                      setQuery((q) => ({ ...q, sort: e.target.value as DirectoryField, page: 0 }));
                    }}
                  >
                    {DIRECTORY_FIELDS.map((field) => (
                      <option key={field} value={field}>
                        {t.fields[field]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t.direction}
                  <select
                    aria-label={t.direction}
                    value={String(query.desc)}
                    onChange={(e) => {
                      setQuery((q) => ({ ...q, desc: e.target.value === 'true', page: 0 }));
                    }}
                  >
                    <option value="false">{t.ascending}</option>
                    <option value="true">{t.descending}</option>
                  </select>
                </label>
              </div>
              <p role="status">{t.count(result.total)}</p>
              <div className="user-table-scroll" tabIndex={0} role="region" aria-label={t.title}>
                <table className="user-table" data-testid="user-table" aria-busy={loading}>
                  <thead>
                    <tr>
                      {columns.map((field) => (
                        <th
                          key={field}
                          data-field={field}
                          aria-sort={
                            query.sort === field
                              ? query.desc
                                ? 'descending'
                                : 'ascending'
                              : 'none'
                          }
                        >
                          <button
                            type="button"
                            onClick={() => {
                              sort(field);
                            }}
                          >
                            {t.fields[field]}
                          </button>
                        </th>
                      ))}
                      <th>{t.edit}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row) => (
                      <tr key={row.id} data-testid="user-row">
                        {columns.map((field) => (
                          <td key={field} data-field={field}>
                            {display(row, field)}
                          </td>
                        ))}
                        <td>
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => {
                              setSelected(row);
                            }}
                          >
                            {t.edit}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!loading && !result.total && <p>{t.empty}</p>}
              <div className="club-actions">
                <button
                  disabled={query.page === 0 || loading}
                  onClick={() => {
                    setQuery((q) => ({ ...q, page: q.page - 1 }));
                  }}
                >
                  {t.previous}
                </button>
                <span>
                  {t.range(query.page + 1, Math.max(1, Math.ceil(result.total / query.pageSize)))}
                </span>
                <button
                  disabled={(query.page + 1) * query.pageSize >= result.total || loading}
                  onClick={() => {
                    setQuery((q) => ({ ...q, page: q.page + 1 }));
                  }}
                >
                  {t.next}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </main>
  );
}
