export const formatTimestamp = (iso: string): string => {
  const formatter = new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
  return formatter.format(new Date(iso));
};

export const formatRelative = (iso: string): string => {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.max(0, now - then);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};

const ANSI_ESCAPE_PATTERN = /(?:\u001B|\u009B)[[\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-PRZcf-ntqry=><]/g;

const stripControlSequences = (value: string): string =>
  value
    .replace(ANSI_ESCAPE_PATTERN, '')
    .replace(/\r/g, '')
    .replace(/[\u0007\u0008]/g, '')
    .replace(/\t+/g, ' ')
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '');

export const escapeHtml = (text: string): string => {
  const cleaned = stripControlSequences(text);
  const trimmed = cleaned.trim();
  return trimmed
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
};

export type MobilePlatform = 'ios' | 'android' | 'postmarketos' | 'ubports' | 'blackberry';

const MOBILE_PLATFORM_VALUES: readonly MobilePlatform[] = [
  'ios',
  'android',
  'postmarketos',
  'ubports',
  'blackberry'
] as const;

const MOBILE_PLATFORM_PATTERNS: ReadonlyArray<{ platform: MobilePlatform; pattern: RegExp }> = [
  { platform: 'ios', pattern: /(iphone|ipad|ipod)(?!.*windows)/i },
  { platform: 'android', pattern: /android/i },
  { platform: 'postmarketos', pattern: /(postmarket|pmos)/i },
  { platform: 'ubports', pattern: /(ubports|ubuntu\s+touch)/i },
  { platform: 'blackberry', pattern: /(blackberry|bb10)/i }
];

const MOBILE_PLATFORM_LABELS: Record<MobilePlatform, string> = {
  ios: 'iOS',
  android: 'Android',
  postmarketos: 'postmarketOS',
  ubports: 'UBports',
  blackberry: 'BlackBerry'
};

const normaliseUserAgent = (userAgent: string): string => userAgent.trim();

export const detectMobilePlatform = (userAgent?: string): MobilePlatform | null => {
  const source =
    typeof userAgent === 'string' && userAgent.trim()
      ? userAgent
      : typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string'
        ? navigator.userAgent
        : '';

  if (!source) {
    return null;
  }

  const normalised = normaliseUserAgent(source);
  for (const entry of MOBILE_PLATFORM_PATTERNS) {
    if (entry.pattern.test(normalised)) {
      return entry.platform;
    }
  }
  return null;
};

export const describeMobilePlatform = (platform: MobilePlatform): string =>
  MOBILE_PLATFORM_LABELS[platform] ?? platform;

export const isMobilePlatform = (value: string | undefined | null): value is MobilePlatform =>
  Boolean(value && MOBILE_PLATFORM_VALUES.includes(value as MobilePlatform));
