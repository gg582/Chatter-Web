export const OPERATING_SYSTEMS = [
  'Windows',
  'MS-DOS',
  'OS/2',
  'Mac OS',
  'Linux',
  'OpenBSD',
  'Plan 9',
  'AmigaOS'
] as const;

export type OperatingSystem = (typeof OPERATING_SYSTEMS)[number];

export const DEFAULT_OPERATING_SYSTEM: OperatingSystem = OPERATING_SYSTEMS[0];
