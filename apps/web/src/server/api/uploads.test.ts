import { describe, expect, it } from 'vitest';
import { parseMetadata } from './uploads.ts';

const b64 = (s: string) => Buffer.from(s).toString('base64');

describe('parseMetadata (tus Upload-Metadata)', () => {
  it('decodes base64 values, including non-ASCII names', () => {
    expect(
      parseMetadata(`filename ${b64('Ochtend ’t Spaarne.mov')},filetype ${b64('video/quicktime')}`),
    ).toEqual({
      filename: 'Ochtend ’t Spaarne.mov',
      filetype: 'video/quicktime',
    });
  });
  it('ignores malformed keys and missing headers', () => {
    expect(parseMetadata(undefined)).toEqual({});
    expect(parseMetadata(`bad key!! ${b64('x')}, ok ${b64('y')}`)).toEqual({ ok: 'y' });
    expect(parseMetadata('flag')).toEqual({ flag: '' });
  });
});
