const NUMERIC_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function isNumericVersion(version: string): boolean {
  return NUMERIC_VERSION.test(version);
}

/** A stable image-workflow sequence replaces the patch component; retries keep their number. */
export function buildReleaseVersion(base: string, sequence: string | undefined): string {
  if (!isNumericVersion(base)) throw new Error('Release base must be a numeric major.minor.patch.');
  if (
    sequence === undefined ||
    !/^[1-9]\d*$/.test(sequence) ||
    !Number.isSafeInteger(Number(sequence))
  ) {
    throw new Error('Release sequence must be a positive safe integer.');
  }
  const prefix = base.slice(0, base.lastIndexOf('.'));
  return `${prefix}.${sequence}`;
}
