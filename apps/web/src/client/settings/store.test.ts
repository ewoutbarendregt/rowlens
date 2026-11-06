import { describe, expect, it, vi } from 'vitest';
import { createSettingsStore } from './store.ts';
import type { UserSettings } from '../../shared/user-settings.ts';
const initial = (theme: 'dark' | 'light' = 'light'): UserSettings => ({
  firstName: null,
  lastName: null,
  defaultBoatType: null,
  revision: 0,
  preferences: {
    theme,
    language: 'nl',
    notesVisible: true,
    noteHoldSeconds: 1,
    driveMiddle: false,
  },
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
describe('account preference synchronization', () => {
  it('ignores an old account response after switching users', async () => {
    const a = deferred<UserSettings>();
    const b = deferred<UserSettings>();
    const apply = vi.fn();
    const store = createSettingsStore({
      load: (id) => (id === 'a' ? a.promise : b.promise),
      save: vi.fn(),
      apply,
      cached: () => null,
      cache: vi.fn(),
    });
    store.setUser('a');
    store.setUser('b');
    b.resolve(initial('dark'));
    await tick();
    a.resolve(initial('light'));
    await tick();
    expect(store.get().userId).toBe('b');
    expect(store.get().settings?.preferences.theme).toBe('dark');
  });
  it('serializes deliberate writes using the latest confirmed revision', async () => {
    let server = initial();
    const revisions: number[] = [];
    const store = createSettingsStore({
      load: () => Promise.resolve(server),
      save: async (_id, revision, changes) => {
        revisions.push(revision);
        await tick();
        server = {
          ...server,
          revision: revision + 1,
          preferences: { ...server.preferences, ...changes },
        };
        return server;
      },
      apply: vi.fn(),
      cached: () => null,
      cache: vi.fn(),
    });
    store.setUser('a');
    await tick();
    const a = store.save({ theme: 'dark' });
    const b = store.save({ notesVisible: false });
    expect(await a).toBe(true);
    expect(await b).toBe(true);
    expect(revisions).toEqual([0, 1]);
    expect(store.get().settings?.preferences).toMatchObject({ theme: 'dark', notesVisible: false });
  });
  it('reloads server choices after conflict and exposes an error instead of overwriting them', async () => {
    let server = initial();
    const store = createSettingsStore({
      load: () => Promise.resolve(server),
      save: () => {
        server = { ...initial('dark'), revision: 3 };
        return Promise.reject(new Error('conflict'));
      },
      apply: vi.fn(),
      cached: () => null,
      cache: vi.fn(),
    });
    store.setUser('a');
    await tick();
    expect(await store.save({ theme: 'light' })).toBe(false);
    await tick();
    expect(store.get()).toMatchObject({
      failed: true,
      settings: { revision: 3, preferences: { theme: 'dark' } },
    });
  });
  it('does not apply a failed old-account recovery to the new account', async () => {
    const saving = deferred<UserSettings>();
    const recovery = deferred<UserSettings>();
    let aLoads = 0;
    const store = createSettingsStore({
      load: async (id) =>
        id === 'b' ? initial('dark') : ++aLoads === 1 ? initial() : recovery.promise,
      save: () => saving.promise,
      apply: vi.fn(),
      cached: () => null,
      cache: vi.fn(),
    });
    store.setUser('a');
    await tick();
    const old = store.save({ theme: 'dark' });
    saving.reject(new Error('network'));
    await tick();
    store.setUser('b');
    await tick();
    recovery.resolve({ ...initial(), revision: 99 });
    await tick();
    expect(await old).toBe(false);
    expect(store.get()).toMatchObject({
      userId: 'b',
      settings: { revision: 0, preferences: { theme: 'dark' } },
    });
  });
  it('uses per-account cache keys and never writes while anonymous', async () => {
    const cached = vi.fn(() => null);
    const save = vi.fn();
    const store = createSettingsStore({
      load: () => Promise.resolve(initial()),
      save,
      apply: vi.fn(),
      cached,
      cache: vi.fn(),
    });
    expect(await store.save({ theme: 'dark' })).toBe(false);
    store.setUser('a');
    await tick();
    store.setUser('b');
    await tick();
    store.setUser(null);
    expect(cached.mock.calls).toEqual([['a'], ['b']]);
    expect(save).not.toHaveBeenCalled();
    expect(store.get().settings).toBeNull();
  });
});
