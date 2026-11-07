import { useEffect, useState } from 'react';
import type { DirectoryRow } from '../../shared/user-directory.ts';
import { ROLES, type Role } from '../../shared/roles.ts';
import { api } from '../api.ts';
import { useAuth } from '../auth/useAuth.ts';
import { locale, lang } from '../i18n/language.ts';
import { ConfirmInline } from '../ui/ConfirmInline.tsx';
import { UserSettingsEditor } from './UserSettingsEditor.tsx';
import { adminStrings } from './strings.ts';
import { directoryStrings, managementError } from './directory-strings.ts';
export function UserEditor({
  user,
  onChanged,
  onBack,
}: {
  user: DirectoryRow;
  onChanged: () => Promise<void>;
  onBack: () => void;
}) {
  const t = directoryStrings(),
    a = adminStrings();
  const { state, refresh } = useAuth();
  const platform = state.kind === 'open' && !!state.user.platformAdmin;
  const [email, setEmail] = useState(user.email),
    [request, setRequest] = useState<string | null>(null),
    [code, setCode] = useState('');
  const [failed, setFailed] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [authorityConfirm, setAuthorityConfirm] = useState(false);
  const [clubId, setClubId] = useState(state.kind === 'open' ? (state.club.id ?? '') : '');
  type Grant = {
    id: string | null;
    email: string;
    userId: string | null;
    roles: Role[];
    source: 'app' | 'server';
  };
  const [grant, setGrant] = useState<Grant | null>(null),
    [roles, setRoles] = useState<Role[]>(['rower']),
    [loaded, setLoaded] = useState(false),
    [remove, setRemove] = useState(false),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let stale = false;
    setLoaded(false);
    setGrant(null);
    setFailed('');
    if (!clubId) return;
    void api('/api/admin/users', { clubId })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const v = (await r.json()) as { entries: Grant[] };
        if (stale) return;
        const g = v.entries.find((e) => e.userId === user.id) ?? null;
        setGrant(g);
        setRoles(g?.roles ?? ['rower']);
        setLoaded(true);
      })
      .catch(() => {
        if (!stale) setFailed(t.failed);
      });
    return () => {
      stale = true;
    };
  }, [clubId, user.id, version, t.failed]);
  const change = async (path: string, body: unknown, method = 'POST', scope?: string) => {
    setBusy(true);
    setFailed('');
    setNotice('');
    try {
      const r = await api(path, { method, body, ...(scope ? { clubId: scope } : {}) });
      if (!r.ok) {
        const v = (await r.json().catch(() => ({}))) as { error?: string };
        setFailed(managementError(v.error));
        return null;
      }
      return r;
    } catch {
      setFailed(t.failed);
      return null;
    } finally {
      setBusy(false);
    }
  };
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
  return (
    <section className="user-editor card" aria-label={t.edit} data-testid="user-editor">
      <button type="button" onClick={onBack}>
        {t.back}
      </button>
      <h2>{name}</h2>
      {user.platformAdmin && <p className="badge">{t.fields.platformAdmin}</p>}
      <dl>
        <dt>{t.fields.id}</dt>
        <dd>{user.id}</dd>
        <dt>{t.fields.createdAt}</dt>
        <dd>{new Date(user.createdAt).toLocaleString(locale())}</dd>
        <dt>{t.fields.lastSeenAt}</dt>
        <dd>{user.lastSeenAt ? new Date(user.lastSeenAt).toLocaleString(locale()) : t.unknown}</dd>
        <dt>{t.fields.verifiedAt}</dt>
        <dd>{user.verifiedAt ? new Date(user.verifiedAt).toLocaleString(locale()) : t.unknown}</dd>
      </dl>
      {failed && <p role="alert">{failed}</p>}
      {notice && <p role="status">{notice}</p>}
      <h3>{t.profile}</h3>
      <UserSettingsEditor
        userId={user.id}
        name={name}
        onSaved={() => {
          void onChanged();
        }}
      />
      <h3>{t.identity}</h3>
      <p>{t.identityHint}</p>
      {!platform && <p>{t.ownerConfirmHint}</p>}
      {user.serverManaged && <p>{t.reserved}</p>}
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void change(`/api/manage/users/${user.id}/email-change`, {
            email,
            revision: user.revision,
            language: lang(),
          }).then(async (r) => {
            if (r) {
              setRequest(((await r.json()) as { id: string }).id);
              setNotice(t.codeSent);
              setCode('');
            }
          });
        }}
      >
        <label>
          {t.fields.email}
          <input
            type="email"
            value={email}
            disabled={busy || user.serverManaged}
            required
            onChange={(e) => {
              setEmail(e.target.value);
              setRequest(null);
            }}
          />
        </label>
        <button disabled={busy || user.serverManaged || email === user.email}>
          {t.requestCode}
        </button>
      </form>
      {request && platform && (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            void change(`/api/manage/email-changes/${request}/confirm`, { code }).then(
              async (r) => {
                if (r) {
                  setNotice(t.emailChanged);
                  setRequest(null);
                  await onChanged();
                  refresh();
                }
              },
            );
          }}
        >
          <label>
            {t.code}
            <input
              inputMode="numeric"
              pattern="[0-9]{6}"
              required
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
              }}
            />
          </label>
          <button disabled={busy}>{t.confirmCode}</button>
        </form>
      )}
      <h3>{t.authority}</h3>
      {platform ? (
        <>
          {authorityConfirm ? (
            <ConfirmInline
              question={t.authorityQuestion}
              yesLabel={t.save}
              onCancel={() => {
                setAuthorityConfirm(false);
              }}
              onConfirm={() => {
                setAuthorityConfirm(false);
                void change(`/api/manage/users/${user.id}/authority`, {
                  enabled: !user.platformAdmin,
                  expected: user.platformAdmin,
                }).then(async (r) => {
                  if (r) {
                    await onChanged();
                    refresh();
                    setNotice(t.saved);
                  }
                });
              }}
            />
          ) : (
            <label className="user-toggle">
              <input
                type="checkbox"
                checked={user.platformAdmin}
                disabled={busy}
                onChange={() => {
                  setAuthorityConfirm(true);
                }}
              />
              {t.fields.platformAdmin}
            </label>
          )}
        </>
      ) : (
        <p>{user.platformAdmin ? t.yes : t.no}</p>
      )}
      <h3>{t.clubAccess}</h3>
      <ul>
        {user.memberships.map((m) => (
          <li key={m.clubId}>
            {m.name}: {m.roles.map((r) => a.roles[r]).join(', ')}{' '}
            {m.archived ? `(${t.archived})` : ''}
          </li>
        ))}
      </ul>
      <p>{t.roleHint}</p>
      {state.kind === 'open' && (
        <label>
          {t.club}
          <select
            aria-label={t.club}
            value={clubId}
            onChange={(e) => {
              setClubId(e.target.value);
              setRemove(false);
            }}
          >
            <option value="">{t.unknown}</option>
            {state.clubs
              ?.filter((c) => platform || c.id === state.club.id)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
      )}
      {clubId && !loaded && !failed && <p role="status">{t.loading}</p>}
      {clubId && loaded && (
        <form
          data-testid="club-role-form"
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            void change(
              grant?.id ? `/api/admin/access/${grant.id}` : '/api/admin/access',
              grant?.id
                ? { roles, expectedRoles: grant.roles }
                : {
                    email: user.email,
                    userId: user.id,
                    roles,
                    ...(grant ? { expectedRoles: grant.roles } : {}),
                  },
              grant?.id ? 'PATCH' : 'POST',
              clubId,
            ).then(async (r) => {
              if (r) {
                setNotice(t.accessSaved);
                setVersion((v) => v + 1);
                await onChanged();
                refresh();
              }
            });
          }}
        >
          {!grant && <p>{t.notMember}</p>}
          <fieldset className="role-choices">
            <legend>{t.fields.roles}</legend>
            {ROLES.map((role) => (
              <label key={role}>
                <input
                  type="checkbox"
                  checked={roles.includes(role)}
                  disabled={busy || (grant?.source === 'server' && role === 'admin')}
                  onChange={(e) => {
                    setRoles(
                      ROLES.filter((r) => (r === role ? e.target.checked : roles.includes(r))),
                    );
                  }}
                />
                {a.roles[role]}
              </label>
            ))}
          </fieldset>
          <button disabled={busy || !roles.length}>{grant ? t.save : t.admit}</button>
          {grant?.id &&
            grant.source !== 'server' &&
            (remove ? (
              <ConfirmInline
                question={t.removeQuestion}
                yesLabel={t.remove}
                onCancel={() => {
                  setRemove(false);
                }}
                onConfirm={() => {
                  setRemove(false);
                  void change(
                    `/api/admin/access/${grant.id ?? ''}`,
                    undefined,
                    'DELETE',
                    clubId,
                  ).then(async (r) => {
                    if (r) {
                      setVersion((v) => v + 1);
                      await onChanged();
                      refresh();
                    }
                  });
                }}
              />
            ) : (
              <button
                type="button"
                className="button--quiet"
                disabled={busy}
                onClick={() => {
                  setRemove(true);
                }}
              >
                {t.remove}
              </button>
            ))}
        </form>
      )}
    </section>
  );
}
