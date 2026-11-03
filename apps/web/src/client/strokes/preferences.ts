// Per-device choices for the Strokes tab (#85); storage may be off (private mode).
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

const DRIVE_MIDDLE_KEY = 'rowlens.driveMiddle';

/** The computed middle of the drive: off unless turned on on this device (Ewout, 2026-11-03). */
export function storedDriveMiddle(storage: StorageLike = localStorage): boolean {
  try {
    return storage.getItem(DRIVE_MIDDLE_KEY) === 'on';
  } catch {
    return false;
  }
}

export function rememberDriveMiddle(on: boolean, storage: StorageLike = localStorage): void {
  try {
    storage.setItem(DRIVE_MIDDLE_KEY, on ? 'on' : 'off');
  } catch {
    // The choice lasts for this page when storage is unavailable.
  }
}
