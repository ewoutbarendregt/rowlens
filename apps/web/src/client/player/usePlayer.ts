import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clampFrame,
  frameAfterSeconds,
  frameCount,
  frameToTime,
  type LoopRange,
  loopJumpTarget,
  normalizeLoop,
  presentedFrame,
  timeToFrame,
} from './frames.ts';

export const SPEEDS = [0.25, 0.5, 1] as const;
export type Speed = (typeof SPEEDS)[number];

export interface PlayerMeasurement {
  kind: 'start' | 'step';
  ms: number;
}

export interface PlayerOptions {
  src: string;
  /** Frame rate of the CFR rendition (from the server's media metadata). */
  fps: number;
  onMeasure?: (m: PlayerMeasurement) => void;
}

/**
 * Frame-accurate control of a <video> element (ADR-0007). The presented frame comes from
 * requestVideoFrameCallback when available (exact), otherwise from currentTime (approximate).
 */
export function usePlayer({ src, fps, onMeasure }: PlayerOptions) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [frame, setFrame] = useState(0);
  const [count, setCount] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [rate, setRateState] = useState<Speed>(1);
  const [ready, setReady] = useState(false);
  /** The picture's shape (width / height), once known; portrait phone video is < 1. */
  const [aspect, setAspect] = useState<number | null>(null);
  const [exact, setExact] = useState(true);
  const [loopRange, setLoopRange] = useState<LoopRange | null>(null);
  const [loopOn, setLoopOn] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [immersive, setImmersive] = useState(false);

  // Refs mirror state for the per-frame callback, which must not re-subscribe on every render.
  const frameRef = useRef(0);
  const countRef = useRef(1);
  const loopRef = useRef<LoopRange | null>(null);
  const targetRef = useRef<number | null>(null);
  const seekStartedAt = useRef<number | null>(null);
  const loadStartedAt = useRef(0);
  /** True while the player pauses itself to jump back to the loop start (not a user pause). */
  const loopingRef = useRef(false);
  const measureRef = useRef(onMeasure);
  measureRef.current = onMeasure;

  loopRef.current = loopOn ? loopRange : null;

  const present = useCallback((presented: number) => {
    frameRef.current = presented;
    setFrame(presented);
    if (targetRef.current === presented) targetRef.current = null;
    if (seekStartedAt.current !== null) {
      measureRef.current?.({ kind: 'step', ms: performance.now() - seekStartedAt.current });
      seekStartedAt.current = null;
    }
  }, []);

  // New clip: reset everything and time how long the first frame takes.
  useEffect(() => {
    loadStartedAt.current = performance.now();
    frameRef.current = 0;
    targetRef.current = null;
    setFrame(0);
    setReady(false);
    setPlaying(false);
    setLoopRange(null);
    setLoopOn(false);
  }, [src]);

  useEffect(() => {
    const video = videoRef.current;
    if (video === null) return;

    const onMetadata = () => {
      countRef.current = frameCount(video.duration, fps);
      setCount(countRef.current);
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        setAspect(video.videoWidth / video.videoHeight);
      }
    };
    const onLoadedData = () => {
      setReady(true);
      measureRef.current?.({ kind: 'start', ms: performance.now() - loadStartedAt.current });
    };
    const onPlay = () => {
      setPlaying(true);
    };
    const onPause = () => {
      if (!loopingRef.current) setPlaying(false);
    };
    const onSeeked = () => {
      // A `seeked` of a seek that a newer step already replaced: the newer one is still pending,
      // and clearing its target here made the next step count from an older frame (lost steps
      // when pressing quickly, found by the notes E2E).
      if (video.seeking) return;
      // The seek is done. The next step counts from where it went, not from the last presented
      // frame: requestVideoFrameCallback may report the new frame only after this event.
      if (targetRef.current !== null) frameRef.current = targetRef.current;
      targetRef.current = null;
      if (!loopingRef.current) return;
      loopingRef.current = false;
      void video.play().catch(() => {
        setPlaying(false);
      });
    };
    const onEnded = () => {
      const loop = loopRef.current;
      if (loop !== null) {
        video.currentTime = frameToTime(loop.in, fps);
        void video.play().catch(() => undefined);
      }
    };
    video.addEventListener('loadedmetadata', onMetadata);
    video.addEventListener('loadeddata', onLoadedData);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);
    video.addEventListener('seeked', onSeeked);

    // At the loop end: pause, seek back to the start, resume on `seeked`. Measured in the spike, a seek
    // while playing takes ~1 s in Chromium (the loop overshot by ~60 frames at 1×), a paused seek one
    // display frame. Never re-seek while a seek is running: that cancels it again and again.
    const loopIfNeeded = (presented: number) => {
      if (video.paused || video.seeking || loopingRef.current) return;
      const jump = loopJumpTarget(presented, loopRef.current);
      if (jump === null) return;
      loopingRef.current = true;
      video.pause();
      video.currentTime = frameToTime(jump, fps);
    };

    let cleanupFrames: () => void;
    if (typeof video.requestVideoFrameCallback === 'function') {
      setExact(true);
      let handle = 0;
      const onFrame: VideoFrameRequestCallback = (_now, metadata) => {
        const presented = presentedFrame(metadata.mediaTime, fps);
        present(presented);
        loopIfNeeded(presented);
        handle = video.requestVideoFrameCallback(onFrame);
      };
      handle = video.requestVideoFrameCallback(onFrame);
      cleanupFrames = () => {
        video.cancelVideoFrameCallback(handle);
      };
    } else {
      setExact(false);
      const onTime = () => {
        const presented = timeToFrame(video.currentTime, fps);
        present(presented);
        loopIfNeeded(presented);
      };
      video.addEventListener('timeupdate', onTime);
      video.addEventListener('seeked', onTime);
      cleanupFrames = () => {
        video.removeEventListener('timeupdate', onTime);
        video.removeEventListener('seeked', onTime);
      };
    }

    return () => {
      cleanupFrames();
      video.removeEventListener('loadedmetadata', onMetadata);
      video.removeEventListener('loadeddata', onLoadedData);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('seeked', onSeeked);
    };
  }, [src, fps, present]);

  useEffect(() => {
    const onChange = () => {
      setFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
    };
  }, []);

  const seekToFrame = useCallback(
    (target: number) => {
      const video = videoRef.current;
      if (video === null) return;
      const next = clampFrame(target, countRef.current);
      targetRef.current = next;
      seekStartedAt.current = performance.now();
      video.currentTime = frameToTime(next, fps);
    },
    [fps],
  );

  /** While a seek is still in flight, the next step counts from its target, so held buttons don't stall. */
  const baseFrame = () => targetRef.current ?? frameRef.current;

  const stepFrames = useCallback(
    (delta: number) => {
      loopingRef.current = false;
      videoRef.current?.pause();
      seekToFrame(baseFrame() + delta);
    },
    [seekToFrame],
  );

  const seekSeconds = useCallback(
    (seconds: number) => {
      loopingRef.current = false;
      videoRef.current?.pause();
      seekToFrame(frameAfterSeconds(baseFrame(), seconds, fps));
    },
    [seekToFrame, fps],
  );

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (video === null) return;
    if (!video.paused || loopingRef.current) {
      loopingRef.current = false;
      video.pause();
      setPlaying(false);
      return;
    }
    const jump = loopJumpTarget(frameRef.current, loopRef.current);
    if (jump !== null) video.currentTime = frameToTime(jump, fps);
    void video.play().catch(() => undefined);
  }, [fps]);

  const setRate = useCallback((speed: Speed) => {
    if (videoRef.current !== null) videoRef.current.playbackRate = speed;
    setRateState(speed);
  }, []);

  const setLoopEdge = useCallback((edge: 'in' | 'out') => {
    const here = frameRef.current;
    setLoopRange((current) => {
      const next =
        edge === 'in'
          ? { in: here, out: Math.max(current?.out ?? countRef.current - 1, here + 1) }
          : { in: Math.min(current?.in ?? 0, here - 1), out: here };
      return normalizeLoop(next, countRef.current);
    });
    setLoopOn(true);
  }, []);

  /** A loop over a known range, e.g. one stroke from catch to next catch (#85). */
  const setLoop = useCallback((range: LoopRange) => {
    const loop = normalizeLoop(range, countRef.current);
    setLoopRange(loop);
    setLoopOn(loop !== null);
  }, []);

  const toggleLoop = useCallback(() => {
    setLoopOn((on) => !on);
  }, []);

  const clearLoop = useCallback(() => {
    setLoopRange(null);
    setLoopOn(false);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (container === null) return;
    // iPhone Safari only allows native fullscreen on <video> (which hides our controls), so it gets a
    // CSS "immersive" mode instead (ADR-0007).
    if (document.fullscreenEnabled && typeof container.requestFullscreen === 'function') {
      if (document.fullscreenElement !== null) void document.exitFullscreen();
      else void container.requestFullscreen().catch(() => undefined);
      return;
    }
    setImmersive((on) => !on);
  }, []);

  const exitImmersive = useCallback(() => {
    setImmersive(false);
  }, []);

  return {
    videoRef,
    containerRef,
    frame,
    count,
    playing,
    rate,
    ready,
    aspect,
    exact,
    loop: loopRange,
    loopOn,
    fullscreen: fullscreen || immersive,
    immersive,
    togglePlay,
    stepFrames,
    seekSeconds,
    seekToFrame,
    setRate,
    setLoopIn: () => {
      setLoopEdge('in');
    },
    setLoopOut: () => {
      setLoopEdge('out');
    },
    setLoop,
    toggleLoop,
    clearLoop,
    toggleFullscreen,
    exitImmersive,
  };
}

export type PlayerApi = ReturnType<typeof usePlayer>;
