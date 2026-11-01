import { describe, expect, it } from 'vitest';
import { looksLikeVideo, sniffContainer } from './sniff.ts';

const box = (type: string) =>
  Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from(type, 'latin1')]);

describe('sniffContainer', () => {
  it.each(['ftyp', 'moov', 'mdat', 'wide', 'free'])('recognises ISO/QuickTime box %s', (type) => {
    expect(sniffContainer(box(type))).toBe('mp4');
  });
  it('recognises Matroska/WebM', () => {
    expect(sniffContainer(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01]))).toBe('matroska');
  });
  it.each([
    ['JPEG', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])],
    ['PDF', Buffer.from('%PDF-1.7')],
    ['zip', Buffer.from([0x50, 0x4b, 3, 4, 0, 0, 0, 0])],
    ['too short', Buffer.from([0, 0])],
    ['text', Buffer.from('hello world')],
  ])('rejects %s', (_name, head) => {
    expect(sniffContainer(head)).toBeNull();
  });
});

describe('looksLikeVideo', () => {
  it('accepts video types or video extensions', () => {
    expect(looksLikeVideo('IMG_1234.MOV', '')).toBe(true);
    expect(looksLikeVideo('clip', 'video/mp4')).toBe(true);
    expect(looksLikeVideo('notes.pdf', 'application/pdf')).toBe(false);
  });
});
