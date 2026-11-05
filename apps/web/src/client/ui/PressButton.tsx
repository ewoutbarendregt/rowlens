import { type ButtonHTMLAttributes, useRef } from 'react';

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & {
  onPress: () => void;
};

/** Activate on pointer release without depending on a following compatibility mouse click.
 * Keyboard and assistive activation still use click (detail 0). */
export function PressButton({ onPress, ...props }: Props) {
  const pointer = useRef<number | null>(null);
  return (
    <button
      type="button"
      {...props}
      onPointerDown={(event) => {
        pointer.current = event.button === 0 && event.isPrimary ? event.pointerId : null;
      }}
      onPointerUp={(event) => {
        const pressed = pointer.current === event.pointerId;
        pointer.current = null;
        if (!pressed) return;
        const box = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < box.left ||
          event.clientX > box.right ||
          event.clientY < box.top ||
          event.clientY > box.bottom
        ) {
          return;
        }
        event.preventDefault();
        onPress();
      }}
      onPointerCancel={() => {
        pointer.current = null;
      }}
      onPointerLeave={() => {
        pointer.current = null;
      }}
      onClick={(event) => {
        if (event.detail === 0) onPress();
      }}
    />
  );
}
