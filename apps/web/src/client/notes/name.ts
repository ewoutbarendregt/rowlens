const NAME_KEY = 'rowlens.authorName';

// The author's name is a convenience on this device only (the pilot has no accounts); storage may
// be off (private mode), and then the name is just asked again next time.
export function rememberedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function rememberName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Not remembered; nothing else depends on it.
  }
}
