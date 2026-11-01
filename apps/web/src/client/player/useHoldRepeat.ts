import { useCallback, useEffect, useRef } from 'react';

const FIRST_REPEAT_MS = 350;
const REPEAT_MS = 70;

/**
 * Button props that run `action` once on press and keep repeating while held (touch or mouse).
 * Keyboard activation (Enter/Space) still works through `onClick`, once per press.
 */
export function useHoldRepeat(action: () => void) {
  const actionRef = useRef(action);
  actionRef.current = action;
  const timers = useRef<{ delay?: number; repeat?: number }>({});
  const firedByPointer = useRef(false);

  const stop = useCallback(() => {
    window.clearTimeout(timers.current.delay);
    window.clearInterval(timers.current.repeat);
    timers.current = {};
  }, []);

  useEffect(() => stop, [stop]);

  return {
    onPointerDown: (event: React.PointerEvent) => {
      if (event.button !== 0) return;
      firedByPointer.current = true;
      actionRef.current();
      stop();
      timers.current.delay = window.setTimeout(() => {
        timers.current.repeat = window.setInterval(() => {
          actionRef.current();
        }, REPEAT_MS);
      }, FIRST_REPEAT_MS);
    },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    onClick: () => {
      // A pointer press already acted on pointerdown; only keyboard clicks act here.
      if (firedByPointer.current) {
        firedByPointer.current = false;
        return;
      }
      actionRef.current();
    },
    onContextMenu: (event: React.MouseEvent) => {
      event.preventDefault(); // long-press on touch screens must not open a menu
    },
  };
}
