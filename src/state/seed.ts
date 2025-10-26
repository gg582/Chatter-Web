import { DEFAULT_OPERATING_SYSTEM } from '../data/operatingSystems.js';
import type { AttachmentEntry, AttachmentKind, ChatState, UserProfile } from './types.js';

const createMediaLibrary = (): Record<AttachmentKind, AttachmentEntry[]> => ({
  image: [],
  video: [],
  audio: [],
  file: []
});

const guestProfile: UserProfile = {
  username: 'guest',
  os: DEFAULT_OPERATING_SYSTEM,
  status: 'Ready to dial in from the web.'
};

export const seedState: ChatState = {
  motd: 'Dial the terminal bridge to join the live board.',
  todaySummary: undefined,
  sessionActive: false,
  currentUser: { ...guestProfile },
  profiles: { [guestProfile.username]: { ...guestProfile } },
  connectedUsers: [],
  messages: [],
  privateMessages: [],
  mediaLibrary: createMediaLibrary(),
  asciiArtDraft: '',
  translation: {
    enabled: false,
    scope: 'chat',
    sourceLang: 'off',
    targetLang: 'off',
    spacing: 1
  },
  handleColor: '#38bdf8',
  palette: 'default',
  systemPalette: {
    foreground: '#cbd5f5',
    background: '#0f172a',
    highlight: '#38bdf8',
    bold: false
  },
  geminiEnabled: false,
  geminiCooling: true,
  elizaEnabled: false,
  elizaLog: [],
  activeGame: '',
  weatherHistory: [],
  timezoneHistory: [],
  polls: {},
  operatorIps: [],
  bannedUsers: [],
  blockedTargets: [],
  pokeLog: [],
  rssFeeds: [],
  bbsThreads: []
};
