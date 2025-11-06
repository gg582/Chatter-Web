export type ReactionType = 'good' | 'sad' | 'cool' | 'angry' | 'checked' | 'love' | 'wtf';

export type ReactionTally = Record<ReactionType, number>;

export interface ChatMessage {
  id: string;
  author: string;
  postedAt: string;
  body: string;
  replyTo?: string;
  reactions: ReactionTally;
}

export type AttachmentKind = 'image' | 'video' | 'audio' | 'file';

export interface AttachmentEntry {
  id: string;
  type: AttachmentKind;
  url: string;
  caption?: string;
}

export interface PrivateMessage {
  id: string;
  to: string;
  from: string;
  body: string;
  sentAt: string;
}

export interface UserProfile {
  username: string;
  status?: string;
  os?: string;
  birthday?: string;
}

export interface PollOption {
  id: string;
  label: string;
  votes: number;
}

export interface Poll {
  label: string;
  question: string;
  multiple: boolean;
  options: PollOption[];
  ballots: Record<string, string[]>;
}

export interface WeatherReport {
  id: string;
  location: string;
  summary: string;
  observedAt: string;
}

export interface TimezoneLookup {
  id: string;
  zone: string;
  time: string;
}

export interface RssFeedEntry {
  id: string;
  title: string;
  url: string;
  publishedAt: string;
}

export interface RssFeed {
  tag: string;
  url: string;
  entries: RssFeedEntry[];
}

export interface BbsReply {
  id: string;
  author: string;
  body: string;
  postedAt: string;
}

export interface BbsThread {
  id: string;
  title: string;
  author: string;
  body: string;
  updatedAt: string;
  replies: BbsReply[];
}

export interface TranslationSettings {
  enabled: boolean;
  scope: 'chat' | 'chat-nohistory' | 'all';
  sourceLang: string;
  targetLang: string;
  spacing: number;
}

export interface SystemPalette {
  foreground: string;
  background: string;
  highlight: string;
  bold: boolean;
}

export interface ChatState {
  motd: string;
  todaySummary?: string;
  sessionActive: boolean;
  lastLogoutAt?: string;
  currentUser: UserProfile;
  profiles: Record<string, UserProfile>;
  connectedUsers: string[];
  messages: ChatMessage[];
  privateMessages: PrivateMessage[];
  mediaLibrary: Record<AttachmentKind, AttachmentEntry[]>;
  asciiArtDraft: string;
  translation: TranslationSettings;
  handleColor: string;
  palette: string;
  systemPalette: SystemPalette;
  geminiEnabled: boolean;
  geminiCooling: boolean;
  elizaEnabled: boolean;
  elizaLog: string[];
  activeGame: '' | 'tetris' | 'liargame' | 'alpha';
  weatherHistory: WeatherReport[];
  timezoneHistory: TimezoneLookup[];
  polls: Record<string, Poll>;
  operatorIps: string[];
  bannedUsers: string[];
  blockedTargets: string[];
  pokeLog: string[];
  rssFeeds: RssFeed[];
  bbsThreads: BbsThread[];
  isServerScrolling: boolean;
}

export interface CommandResult {
  ok: boolean;
  message?: string;
  error?: string;
}
