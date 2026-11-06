import {
  effectivePreferences,
  type Preferences,
  type UserSettings,
} from '../../shared/user-settings.ts';
export interface SettingsState {
  userId: string | null;
  settings: UserSettings | null;
  loading: boolean;
  saving: boolean;
  failed: boolean;
}
interface Dependencies {
  load: (userId: string) => Promise<UserSettings>;
  save: (
    userId: string,
    revision: number,
    changes: Partial<Preferences>,
    importLegacy: boolean,
  ) => Promise<UserSettings>;
  apply: (settings: UserSettings | null) => void;
  cache: (userId: string, settings: UserSettings) => void;
  cached: (userId: string) => UserSettings | null;
}
type Write = { changes: Partial<Preferences>; importLegacy: boolean; done: (ok: boolean) => void };
/** Account ownership, stale-response cancellation and serialized, revision-checked preference writes. */
export function createSettingsStore(deps: Dependencies) {
  let state: SettingsState = {
    userId: null,
    settings: null,
    loading: false,
    saving: false,
    failed: false,
  };
  let epoch = 0;
  let request = 0;
  let persisted: UserSettings | null = null;
  let verified = false;
  let loading: Promise<void> | null = null;
  let queue: Write[] = [];
  let running = false;
  let refreshAfterWrite = false;
  const listeners = new Set<() => void>();
  const publish = (next: Partial<SettingsState>) => {
    state = { ...state, ...next };
    deps.apply(state.settings);
    for (const listener of listeners) listener();
  };
  const display = () => {
    if (persisted === null) return null;
    let preferences = { ...persisted.preferences };
    for (const w of queue) if (!w.importLegacy) preferences = { ...preferences, ...w.changes };
    return { ...persisted, preferences };
  };
  const load = async () => {
    if (state.userId === null) return;
    if (running) {
      refreshAfterWrite = true;
      return;
    }
    const owner = state.userId;
    const generation = epoch;
    const token = ++request;
    publish({ loading: true });
    const work = (async () => {
      try {
        const settings = await deps.load(owner);
        if (generation !== epoch || token !== request) return;
        persisted = settings;
        verified = true;
        deps.cache(owner, settings);
        publish({ settings, loading: false, failed: false });
      } catch {
        if (generation === epoch && token === request) publish({ loading: false, failed: true });
      }
    })();
    loading = work;
    await work;
    if (loading === work) loading = null;
  };
  const drain = async () => {
    if (running || state.userId === null || persisted === null) return;
    const owner = state.userId;
    const generation = epoch;
    running = true;
    publish({ saving: true, failed: false });
    while (queue.length > 0 && generation === epoch) {
      const entry = queue[0];
      if (entry === undefined) break;
      try {
        const settings = await deps.save(
          owner,
          persisted.revision,
          entry.changes,
          entry.importLegacy,
        );
        if (generation !== epoch) return;
        persisted = settings;
        deps.cache(owner, settings);
        queue.shift();
        entry.done(true);
        publish({ settings: display() });
      } catch {
        if (generation !== epoch) return;
        for (const pending of queue) pending.done(false);
        queue = [];
        try {
          const current = await deps.load(owner);
          if (generation !== epoch) return;
          persisted = current;
          deps.cache(owner, persisted);
        } catch {
          /* Keep the last confirmed values; expose the failure and a retry action. */
        }
        if (generation === epoch) publish({ settings: persisted, failed: true });
        break;
      }
    }
    if (generation === epoch) {
      running = false;
      publish({ saving: false });
      if (refreshAfterWrite) {
        refreshAfterWrite = false;
        void load();
      }
    }
  };
  return {
    get: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setUser: (userId: string | null) => {
      if (userId === state.userId) return;
      epoch++;
      request++;
      for (const entry of queue) entry.done(false);
      queue = [];
      running = false;
      loading = null;
      verified = false;
      persisted = null;
      refreshAfterWrite = false;
      publish({
        userId,
        settings: userId === null ? null : deps.cached(userId),
        loading: userId !== null,
        saving: false,
        failed: false,
      });
      if (userId !== null) void load();
    },
    refresh: load,
    save: async (changes: Partial<Preferences>, importLegacy = false): Promise<boolean> => {
      const generation = epoch;
      if (state.userId === null) return false;
      if (loading !== null) await loading;
      if (generation !== epoch || !verified || persisted === null) return false;
      return new Promise<boolean>((done) => {
        queue.push({ changes, importLegacy, done });
        publish({ settings: display() });
        void drain();
      });
    },
    effective: (fallback: Preferences) => effectivePreferences(state.settings, fallback),
  };
}
