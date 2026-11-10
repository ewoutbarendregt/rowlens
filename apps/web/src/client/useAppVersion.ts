/** Numeric release of this client bundle; diagnostic image hashes are never user-facing. */
export function useAppVersion(): string {
  return __ROWLENS_RELEASE__;
}
