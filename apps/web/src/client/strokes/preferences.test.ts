import { describe, expect, it } from 'vitest';
import { rememberDriveMiddle, storedDriveMiddle } from './preferences.ts';

const memory = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
};

describe('the computed middle of the drive', () => {
  it('is off until turned on, and remembered per device', () => {
    const storage = memory();
    expect(storedDriveMiddle(storage)).toBe(false);
    rememberDriveMiddle(true, storage);
    expect(storedDriveMiddle(storage)).toBe(true);
    rememberDriveMiddle(false, storage);
    expect(storedDriveMiddle(storage)).toBe(false);
  });

  it('stays off when storage refuses', () => {
    const broken = {
      getItem: () => {
        throw new Error('private mode');
      },
      setItem: () => {
        throw new Error('private mode');
      },
    };
    expect(storedDriveMiddle(broken)).toBe(false);
    expect(() => {
      rememberDriveMiddle(true, broken);
    }).not.toThrow();
  });
});
