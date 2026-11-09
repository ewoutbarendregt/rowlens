/**
 * Build-time feature flags (until the per-club flag service, #21). A disabled feature is removed from
 * the production bundle entirely, which only works if:
 * - flags are read with dot notation (`import.meta.env.VITE_X`; bracket access isn't replaced), and
 * - each flag is its own exported constant (the bundler doesn't fold properties of an exported object).
 */

/** Player spike (#51): dev server always; production builds only with VITE_FEATURE_PLAYER_DEMO=true. */
export const PLAYER_DEMO =
  import.meta.env.DEV || import.meta.env.VITE_FEATURE_PLAYER_DEMO === 'true';

/**
 * The boat line found in every frame (ADR-0018). On unless a build sets
 * VITE_FEATURE_AUTO_BOAT_LINE=false: a switch to take it away again if it misleads coaches; the
 * worker keeps finding the lines either way.
 */
export const AUTO_BOAT_LINE = import.meta.env.VITE_FEATURE_AUTO_BOAT_LINE !== 'false';

/** Account applications and multi-club UI; pair with server UNIFIED_USERS=true. */
export const UNIFIED_USERS =
  import.meta.env.DEV || import.meta.env.VITE_FEATURE_UNIFIED_USERS === 'true';

/** Independent training entries and read-only source annotation layers. */
export const VIDEO_REUSE =
  import.meta.env.DEV || import.meta.env.VITE_FEATURE_VIDEO_REUSE === 'true';
