import { OPERATING_SYSTEMS } from '../data/operatingSystems.js';
import { seedState } from './seed.js';
import type {
  AttachmentEntry,
  AttachmentKind,
  BbsThread,
  ChatMessage,
  ChatState,
  CommandResult,
  Poll,
  ReactionType,
  RssFeed,
  TimezoneLookup,
  WeatherReport
} from './types.js';

const clone = <T>(value: T): T =>
  typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));

const randomId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

const normalise = (value: string) => value.trim().toLowerCase();

const createEmptyReactions = (): ChatMessage['reactions'] => ({
  good: 0,
  sad: 0,
  cool: 0,
  angry: 0,
  checked: 0,
  love: 0,
  wtf: 0
});

type Listener = () => void;

export class ChatStore {
  private state: ChatState;
  private listeners = new Set<Listener>();

  constructor(initialState: ChatState = seedState) {
    this.state = clone(initialState);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    for (const listener of this.listeners) {
      listener();
    }
  }

  snapshot(): ChatState {
    return clone(this.state);
  }

  endSession(): CommandResult {
    if (!this.state.sessionActive) {
      return { ok: false, error: 'Already logged out.' };
    }
    this.state.sessionActive = false;
    this.state.lastLogoutAt = new Date().toISOString();
    this.emit();
    return { ok: true, message: 'Session ended.' };
  }

  resumeSession(): CommandResult {
    if (this.state.sessionActive) {
      return { ok: false, error: 'Session already active.' };
    }
    this.state.sessionActive = true;
    this.emit();
    return { ok: true, message: 'Session restored.' };
  }

  listUsers(): string[] {
    return Object.keys(this.state.profiles).sort((a, b) => a.localeCompare(b));
  }

  connectedUsers(): string[] {
    return [...this.state.connectedUsers];
  }

  connectedCount(): number {
    return this.state.connectedUsers.length;
  }

  searchUsers(query: string): string[] {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }
    const lower = trimmed.toLowerCase();
    return this.listUsers().filter((user) => user.toLowerCase().includes(lower));
  }

  getMotd(): string {
    return this.state.motd;
  }

  sendMessage(body: string, replyTo?: string): CommandResult {
    const text = body.trim();
    if (!text) {
      return { ok: false, error: 'Message cannot be empty.' };
    }
    if (replyTo && !this.getMessageById(replyTo)) {
      return { ok: false, error: 'Reply target not found.' };
    }
    // Message is not immediately added to the local state.
    // It should only appear when received back from the SSH connection.
    // This ensures the UI always reflects what the server actually received.
    return { ok: true, message: 'Message will appear when received from server.' };
  }

  getMessageById(messageId: string): ChatMessage | undefined {
    return this.state.messages.find((message) => message.id === messageId);
  }

  deleteMessages(ids: string[]): CommandResult {
    const trimmed = ids.map((id) => id.trim()).filter(Boolean);
    if (trimmed.length === 0) {
      return { ok: false, error: 'Provide at least one message id.' };
    }
    const before = this.state.messages.length;
    const idSet = new Set(trimmed);
    this.state.messages = this.state.messages.filter((message) => !idSet.has(message.id));
    if (this.state.messages.length === before) {
      return { ok: false, error: 'No matching messages found.' };
    }
    this.emit();
    return { ok: true, message: 'Messages deleted.' };
  }

  reactToMessage(messageId: string, reaction: ReactionType): CommandResult {
    const message = this.getMessageById(messageId);
    if (!message) {
      return { ok: false, error: 'Message not found.' };
    }
    message.reactions[reaction] = (message.reactions[reaction] ?? 0) + 1;
    this.emit();
    return { ok: true, message: 'Reaction recorded.' };
  }

  renameUser(newName: string): CommandResult {
    const nickname = newName.trim();
    if (!nickname) {
      return { ok: false, error: 'Nickname cannot be empty.' };
    }
    const existing = this.listUsers().find((user) => user.toLowerCase() === nickname.toLowerCase());
    if (existing && existing !== this.state.currentUser.username) {
      return { ok: false, error: 'That nickname is already in use.' };
    }
    const previousName = this.state.currentUser.username;
    if (previousName === nickname) {
      return { ok: true, message: 'Nickname unchanged.' };
    }
    const profile = this.state.profiles[previousName];
    delete this.state.profiles[previousName];
    profile.username = nickname;
    this.state.profiles[nickname] = profile;
    this.state.currentUser = profile;
    this.state.connectedUsers = this.state.connectedUsers.map((user) =>
      user === previousName ? nickname : user
    );
    this.state.messages = this.state.messages.map((message) =>
      message.author === previousName ? { ...message, author: nickname } : message
    );
    this.emit();
    return { ok: true, message: `Nickname changed to ${nickname}.` };
  }

  setStatus(status: string | null): CommandResult {
    const value = status?.trim();
    if (value) {
      this.state.currentUser.status = value;
      this.state.profiles[this.state.currentUser.username].status = value;
      this.emit();
      return { ok: true, message: 'Status updated.' };
    }
    delete this.state.currentUser.status;
    delete this.state.profiles[this.state.currentUser.username].status;
    this.emit();
    return { ok: true, message: 'Status cleared.' };
  }

  getStatus(username: string): string | undefined {
    return this.state.profiles[username]?.status;
  }

  setOperatingSystem(os: string): CommandResult {
    const value = os.trim();
    if (!value) {
      return { ok: false, error: 'Choose an operating system.' };
    }

    const resolved = OPERATING_SYSTEMS.find((entry) => normalise(entry) === normalise(value));
    if (!resolved) {
      return {
        ok: false,
        error: `Supported systems: ${OPERATING_SYSTEMS.join(', ')}.`
      };
    }

    this.state.currentUser.os = resolved;
    this.state.profiles[this.state.currentUser.username].os = resolved;
    this.emit();
    return { ok: true, message: `Operating system set to ${resolved}.` };
  }

  getOperatingSystem(username: string): string | undefined {
    return this.state.profiles[username]?.os;
  }

  setBirthday(birthday: string): CommandResult {
    const trimmed = birthday.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return { ok: false, error: 'Use ISO format: YYYY-MM-DD.' };
    }
    this.state.currentUser.birthday = trimmed;
    this.state.profiles[this.state.currentUser.username].birthday = trimmed;
    this.emit();
    return { ok: true, message: 'Birthday saved.' };
  }

  findSoulmates(): string[] {
    const birthday = this.state.currentUser.birthday;
    if (!birthday) {
      return [];
    }
    return this.listUsers().filter(
      (user) => user !== this.state.currentUser.username && this.state.profiles[user]?.birthday === birthday
    );
  }

  findOsPairs(): string[] {
    const os = this.state.currentUser.os;
    if (!os) {
      return [];
    }
    return this.listUsers().filter(
      (user) => user !== this.state.currentUser.username && normalise(this.state.profiles[user]?.os ?? '') === normalise(os)
    );
  }

  recordPrivateMessage(target: string, body: string): CommandResult {
    const recipient = target.trim();
    const message = body.trim();
    if (!recipient || !message) {
      return { ok: false, error: 'Provide both a recipient and message.' };
    }
    if (!this.state.profiles[recipient]) {
      return { ok: false, error: 'Recipient not found.' };
    }
    const entry = {
      id: randomId('pm'),
      to: recipient,
      from: this.state.currentUser.username,
      body: message,
      sentAt: new Date().toISOString()
    };
    this.state.privateMessages.unshift(entry);
    this.emit();
    return { ok: true, message: 'Private message sent.' };
  }

  addAttachment(type: AttachmentKind, url: string, caption?: string): CommandResult {
    const link = url.trim();
    if (!link) {
      return { ok: false, error: 'Provide a URL.' };
    }
    const entry: AttachmentEntry = {
      id: randomId(type),
      type,
      url: link,
      caption: caption?.trim() || undefined
    };
    this.state.mediaLibrary[type].unshift(entry);
    this.emit();
    return { ok: true, message: 'Attachment added.' };
  }

  updateAsciiArt(art: string) {
    this.state.asciiArtDraft = art;
    this.emit();
  }

  setHandleColor(color: string) {
    this.state.handleColor = color;
    this.emit();
  }

  setPalette(palette: string) {
    this.state.palette = palette;
    this.emit();
  }

  setSystemPalette(palette: Partial<ChatState['systemPalette']>) {
    this.state.systemPalette = { ...this.state.systemPalette, ...palette };
    this.emit();
  }

  updateTranslation(settings: Partial<ChatState['translation']>) {
    this.state.translation = { ...this.state.translation, ...settings };
    this.emit();
  }

  setGeminiEnabled(enabled: boolean) {
    this.state.geminiEnabled = enabled;
    if (enabled) {
      this.state.geminiCooling = false;
    }
    this.emit();
  }

  unfreezeGemini() {
    this.state.geminiCooling = false;
    this.emit();
  }

  setElizaEnabled(enabled: boolean) {
    this.state.elizaEnabled = enabled;
    this.emit();
  }

  elizaChat(message: string): string {
    const text = message.trim();
    if (!text) {
      return 'Tell me more about that.';
    }
    const reply = `Eliza reflects: “${text.replace(/"/g, '\u201d')}”`;
    this.state.elizaLog.push(reply);
    this.emit();
    return reply;
  }

  setActiveGame(game: '' | 'tetris' | 'liargame' | 'alpha') {
    this.state.activeGame = game;
    this.emit();
  }

  suspendGame() {
    this.state.activeGame = '';
    this.emit();
  }

  recordWeather(report: WeatherReport) {
    this.state.weatherHistory.unshift(report);
    this.emit();
  }

  recordTimezone(lookup: TimezoneLookup) {
    this.state.timezoneHistory.unshift(lookup);
    this.emit();
  }

  updateToday(summary: string) {
    this.state.todaySummary = summary;
    this.emit();
  }

  createPoll(label: string, question: string, options: string[], multiple: boolean): CommandResult {
    const name = label.trim();
    if (!name) {
      return { ok: false, error: 'Provide a poll label.' };
    }
    const prompt = question.trim();
    const filteredOptions = options.map((opt) => opt.trim()).filter(Boolean);
    if (!prompt || filteredOptions.length < 2) {
      return { ok: false, error: 'Provide a question and at least two options.' };
    }
    const poll: Poll = {
      label: name,
      question: prompt,
      multiple,
      options: filteredOptions.map((labelText, index) => ({
        id: `${name}-${index + 1}`,
        label: labelText,
        votes: 0
      })),
      ballots: {}
    };
    this.state.polls[name] = poll;
    this.emit();
    return { ok: true, message: `Poll ${name} saved.` };
  }

  vote(label: string, choices: string[]): CommandResult {
    const poll = this.state.polls[label];
    if (!poll) {
      return { ok: false, error: 'Poll not found.' };
    }
    const selection = choices.map((choice) => choice.trim()).filter(Boolean);
    if (selection.length === 0) {
      return { ok: false, error: 'Select at least one option.' };
    }
    if (!poll.multiple && selection.length > 1) {
      return { ok: false, error: 'This poll only allows one vote.' };
    }
    const validIds = new Set(poll.options.map((option) => option.id));
    if (!selection.every((choice) => validIds.has(choice))) {
      return { ok: false, error: 'Invalid option.' };
    }
    const voter = this.state.currentUser.username;
    poll.ballots[voter] = selection;
    for (const option of poll.options) {
      option.votes = 0;
    }
    for (const ballot of Object.values(poll.ballots)) {
      for (const choice of ballot) {
        const option = poll.options.find((entry) => entry.id === choice);
        if (option) {
          option.votes += 1;
        }
      }
    }
    this.emit();
    return { ok: true, message: 'Vote recorded.' };
  }

  quickVote(label: string, index: number): CommandResult {
    const poll = this.state.polls[label];
    if (!poll) {
      return { ok: false, error: 'Poll not found.' };
    }
    const option = poll.options[index];
    if (!option) {
      return { ok: false, error: 'Option not available.' };
    }
    return this.vote(label, [option.id]);
  }

  grantOperator(ip: string): CommandResult {
    const entry = ip.trim();
    if (!entry) {
      return { ok: false, error: 'Provide an IP address.' };
    }
    if (!this.state.operatorIps.includes(entry)) {
      this.state.operatorIps.push(entry);
      this.emit();
    }
    return { ok: true, message: 'Operator access granted.' };
  }

  revokeOperator(ip: string): CommandResult {
    const entry = ip.trim();
    const before = this.state.operatorIps.length;
    this.state.operatorIps = this.state.operatorIps.filter((value) => value !== entry);
    if (this.state.operatorIps.length === before) {
      return { ok: false, error: 'IP not found.' };
    }
    this.emit();
    return { ok: true, message: 'Operator access revoked.' };
  }

  banUser(username: string): CommandResult {
    const user = username.trim();
    if (!user) {
      return { ok: false, error: 'Provide a username.' };
    }
    if (!this.state.bannedUsers.includes(user)) {
      this.state.bannedUsers.push(user);
      this.emit();
    }
    return { ok: true, message: 'User banned.' };
  }

  pardonTarget(target: string): CommandResult {
    const name = target.trim();
    const before = this.state.bannedUsers.length;
    this.state.bannedUsers = this.state.bannedUsers.filter((user) => user !== name);
    if (this.state.bannedUsers.length === before) {
      return { ok: false, error: 'Target not found.' };
    }
    this.emit();
    return { ok: true, message: 'Ban removed.' };
  }

  blockTarget(target: string): CommandResult {
    const value = target.trim();
    if (!value) {
      return { ok: false, error: 'Provide a target.' };
    }
    if (!this.state.blockedTargets.includes(value)) {
      this.state.blockedTargets.push(value);
      this.emit();
    }
    return { ok: true, message: 'Target blocked.' };
  }

  unblockTarget(target: string): CommandResult {
    if (target === 'all') {
      this.state.blockedTargets = [];
      this.emit();
      return { ok: true, message: 'All blocks cleared.' };
    }
    const entry = target.trim();
    const before = this.state.blockedTargets.length;
    this.state.blockedTargets = this.state.blockedTargets.filter((value) => value !== entry);
    if (this.state.blockedTargets.length === before) {
      return { ok: false, error: 'Target not blocked.' };
    }
    this.emit();
    return { ok: true, message: 'Block removed.' };
  }

  pokeUser(username: string): CommandResult {
    const user = username.trim();
    if (!user) {
      return { ok: false, error: 'Provide a username.' };
    }
    this.state.pokeLog.unshift(`${new Date().toISOString()} · Poked ${user}`);
    this.emit();
    return { ok: true, message: 'Bell sent.' };
  }

  kickUser(username: string): CommandResult {
    const user = username.trim();
    if (!user) {
      return { ok: false, error: 'Provide a username.' };
    }
    const before = this.state.connectedUsers.length;
    this.state.connectedUsers = this.state.connectedUsers.filter((entry) => entry !== user);
    if (this.state.connectedUsers.length === before) {
      return { ok: false, error: 'User not connected.' };
    }
    this.emit();
    return { ok: true, message: 'User kicked.' };
  }

  addRssFeed(url: string, tag: string): CommandResult {
    const link = url.trim();
    const label = tag.trim();
    if (!link || !label) {
      return { ok: false, error: 'Provide both a URL and tag.' };
    }
    if (this.state.rssFeeds.some((feed) => feed.tag === label)) {
      return { ok: false, error: 'Tag already exists.' };
    }
    const feed: RssFeed = { tag: label, url: link, entries: [] };
    this.state.rssFeeds.push(feed);
    this.emit();
    return { ok: true, message: 'Feed saved.' };
  }

  readFeed(tag: string): RssFeed | undefined {
    return this.state.rssFeeds.find((feed) => feed.tag === tag);
  }

  postBbsThread(title: string, body: string): CommandResult {
    const subject = title.trim();
    const content = body.trim();
    if (!subject || !content) {
      return { ok: false, error: 'Provide both a title and body.' };
    }
    const thread: BbsThread = {
      id: randomId('bbs'),
      title: subject,
      author: this.state.currentUser.username,
      body: content,
      updatedAt: new Date().toISOString(),
      replies: []
    };
    this.state.bbsThreads.unshift(thread);
    this.emit();
    return { ok: true, message: 'Thread posted.' };
  }

  commentOnBbs(threadId: string, body: string): CommandResult {
    const thread = this.state.bbsThreads.find((entry) => entry.id === threadId);
    if (!thread) {
      return { ok: false, error: 'Thread not found.' };
    }
    const content = body.trim();
    if (!content) {
      return { ok: false, error: 'Comment cannot be empty.' };
    }
    thread.replies.push({
      id: randomId('reply'),
      author: this.state.currentUser.username,
      body: content,
      postedAt: new Date().toISOString()
    });
    thread.updatedAt = new Date().toISOString();
    this.emit();
    return { ok: true, message: 'Comment added.' };
  }

  regenBbs() {
    const thread: BbsThread = {
      id: randomId('bbs'),
      title: 'Automated bulletin refresh',
      author: 'system',
      body: 'The board was regenerated. Old cache cleared.',
      updatedAt: new Date().toISOString(),
      replies: []
    };
    this.state.bbsThreads.unshift(thread);
    this.emit();
  }

  deleteBbs(threadId: string): CommandResult {
    const before = this.state.bbsThreads.length;
    this.state.bbsThreads = this.state.bbsThreads.filter((thread) => thread.id !== threadId);
    if (this.state.bbsThreads.length === before) {
      return { ok: false, error: 'Thread not found.' };
    }
    this.emit();
    return { ok: true, message: 'Thread deleted.' };
  }

  setServerScrolling(isScrolling: boolean): void {
    this.state.isServerScrolling = isScrolling;
    this.emit();
  }
}
