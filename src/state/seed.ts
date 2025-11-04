import { DEFAULT_OPERATING_SYSTEM } from '../data/operatingSystems.js';
import { pickRandomNickname } from '../data/nicknames.js';
import type {
  AttachmentEntry,
  AttachmentKind,
  ChatMessage,
  ChatState,
  ReactionTally,
  UserProfile
} from './types.js';

const createMediaLibrary = (): Record<AttachmentKind, AttachmentEntry[]> => ({
  image: [],
  video: [],
  audio: [],
  file: []
});

const guestHandle = pickRandomNickname();

const guestProfile: UserProfile = {
  username: guestHandle,
  os: DEFAULT_OPERATING_SYSTEM,
  status: 'Ready to dial in from the web.'
};

const adminProfile: UserProfile = {
  username: 'admin',
  status: 'Keeping the lounge tidy.'
};

const createReactions = (): ReactionTally => ({
  good: 0,
  sad: 0,
  cool: 0,
  angry: 0,
  checked: 0,
  love: 0,
  wtf: 0
});

const seededMessages: ChatMessage[] = [
  {
    id: 'm-1001',
    author: adminProfile.username,
    postedAt: '2024-01-01T12:00:00.000Z',
    body: 'Welcome to the Chatter BBS bridge. Tap connect to link your console.',
    reactions: createReactions()
  },
  {
    id: 'm-1002',
    author: guestProfile.username,
    postedAt: '2024-01-01T12:05:00.000Z',
    body: 'Thanks for the invite! Dialling in now.',
    replyTo: 'm-1001',
    reactions: createReactions()
  }
];

export const seedState: ChatState = {
  motd: 'Dial the terminal bridge to join the live board.',
  todaySummary: undefined,
  sessionActive: false,
  currentUser: { ...guestProfile },
  profiles: {
    [guestProfile.username]: { ...guestProfile },
    [adminProfile.username]: { ...adminProfile }
  },
  connectedUsers: [adminProfile.username],
  messages: seededMessages,
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
  bbsThreads: [],
  isServerScrolling: false
};
