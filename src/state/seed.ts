import type {
  AttachmentEntry,
  AttachmentKind,
  BbsThread,
  ChatMessage,
  ChatState,
  Poll,
  ReactionTally,
  RssFeed,
  UserProfile
} from './types';

const createReactions = (): ReactionTally => ({
  good: 0,
  sad: 0,
  cool: 0,
  angry: 0,
  checked: 0,
  love: 0,
  wtf: 0
});

const timestamp = (iso: string) => new Date(iso).toISOString();

const profiles: Record<string, UserProfile> = {
  admin: {
    username: 'admin',
    status: 'Curating the BBS. Type /help for the full command list.',
    os: 'OpenBSD',
    birthday: '1994-09-12'
  },
  ada: {
    username: 'ada',
    status: 'Working on a new terminal UI experiment.',
    os: 'Void Linux',
    birthday: '1990-12-10'
  },
  eliza: {
    username: 'eliza',
    status: 'Listening quietly.',
    os: 'Plan 9',
    birthday: '1985-07-21'
  }
};

const messages: ChatMessage[] = [
  {
    id: 'm-1001',
    author: 'admin',
    postedAt: timestamp('2024-03-01T17:30:00Z'),
    body: 'Welcome to Chatter! Try /motd or browse the bulletin board with /bbs list.',
    reactions: createReactions()
  },
  {
    id: 'm-1002',
    author: 'ada',
    postedAt: timestamp('2024-03-01T17:31:10Z'),
    body: 'Pro tip: /reply m-1001 This new web UI mirrors every slash command.',
    replyTo: 'm-1001',
    reactions: createReactions()
  },
  {
    id: 'm-1003',
    author: 'admin',
    postedAt: timestamp('2024-03-01T17:35:42Z'),
    body: 'Want colour? Use /palette neon or tweak /color cyan;magenta.',
    reactions: createReactions()
  }
];

const mediaEntries = (type: AttachmentKind, baseId: string, url: string, caption: string): AttachmentEntry => ({
  id: `${type}-${baseId}`,
  type,
  url,
  caption
});

const mediaLibrary: Record<AttachmentKind, AttachmentEntry[]> = {
  image: [
    mediaEntries('image', 'intro', 'https://example.com/bbs-capsule.jpg', 'Terminal cockpit mock-up')
  ],
  video: [
    mediaEntries('video', 'demo', 'https://example.com/chatter-tour.mp4', 'Chatter tour recording')
  ],
  audio: [mediaEntries('audio', 'chime', 'https://example.com/notification.ogg', 'Incoming PM chime')],
  file: [mediaEntries('file', 'handbook', 'https://example.com/moderation-handbook.pdf', 'Moderation handbook')]
};

const rssFeeds: RssFeed[] = [
  {
    tag: 'community',
    url: 'https://example.com/community.xml',
    entries: [
      {
        id: 'community-1',
        title: 'Weekly round-up',
        url: 'https://example.com/community/weekly',
        publishedAt: timestamp('2024-02-28T14:00:00Z')
      }
    ]
  },
  {
    tag: 'devlog',
    url: 'https://example.com/devlog.xml',
    entries: [
      {
        id: 'devlog-1',
        title: 'Deploying the Gemini assistant',
        url: 'https://example.com/devlog/gemini',
        publishedAt: timestamp('2024-02-25T10:15:00Z')
      }
    ]
  }
];

const bulletinBoard: BbsThread[] = [
  {
    id: 'bbs-01',
    title: 'Patch Tuesday summary',
    author: 'admin',
    body: 'Kernel upgrades complete. Run /today for the daily programming puzzle.',
    updatedAt: timestamp('2024-03-01T09:00:00Z'),
    replies: [
      {
        id: 'bbs-01-r1',
        author: 'ada',
        body: 'Thanks! The translation proxy is much smoother now.',
        postedAt: timestamp('2024-03-01T11:30:00Z')
      }
    ]
  },
  {
    id: 'bbs-02',
    title: 'ASCII art jam',
    author: 'eliza',
    body: 'Share your favourite ANSI blocks and enable /asciiart to craft them inline.',
    updatedAt: timestamp('2024-02-26T21:45:00Z'),
    replies: []
  }
];

const polls: Record<string, Poll> = {
  launch: {
    label: 'launch',
    question: 'Where should we host the next community night?',
    multiple: false,
    options: [
      { id: 'launch-holo', label: 'Holodeck', votes: 4 },
      { id: 'launch-retro', label: 'Retro arcade', votes: 6 },
      { id: 'launch-ham', label: 'Packet radio', votes: 2 }
    ],
    ballots: {
      admin: ['launch-retro'],
      ada: ['launch-holo']
    }
  }
};

export const seedState: ChatState = {
  motd: 'Chatter v2.3 — now with Gemini + Eliza assistants. Type /help to see every command.',
  todaySummary: undefined,
  sessionActive: true,
  currentUser: { ...profiles.admin },
  profiles,
  connectedUsers: ['admin', 'ada', 'eliza'],
  messages,
  privateMessages: [],
  mediaLibrary,
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
  polls,
  operatorIps: ['127.0.0.1'],
  bannedUsers: [],
  blockedTargets: [],
  pokeLog: [],
  rssFeeds,
  bbsThreads: bulletinBoard
};
