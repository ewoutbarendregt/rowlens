import { describe, expect, it } from 'vitest';
import { savedTheme, saveTheme } from './theme.ts';

function memory() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

describe('colour mode choice', () => {
  it('is light unless something else was saved', () => {
    const storage = memory();
    expect(savedTheme(storage)).toBe('light');
    saveTheme('dark', storage);
    expect(savedTheme(storage)).toBe('dark');
    saveTheme('hc', storage);
    expect(savedTheme(storage)).toBe('hc');
    saveTheme('light', storage);
    expect(storage.data.size).toBe(0);
    expect(savedTheme(storage)).toBe('light');
  });

  it('ignores unknown values and storage that throws', () => {
    const storage = memory();
    storage.data.set('rowlens.theme', 'purple');
    expect(savedTheme(storage)).toBe('light');
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    expect(savedTheme(broken)).toBe('light');
    expect(() => {
      saveTheme('dark', broken);
    }).not.toThrow();
    expect(savedTheme(undefined)).toBe('light');
  });
});
