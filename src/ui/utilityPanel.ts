import { ChatStore } from '../state/chatStore.js';
import { escapeHtml } from './helpers.js';

type CommandEntry = {
  command: string;
  description: string;
};

const commandEntries: CommandEntry[] = [
  { command: 'help', description: 'show this message' },
  { command: 'exit', description: 'leave the chat' },
  { command: 'nick <name>', description: 'change your display name' },
  { command: 'pm <username> <message>', description: 'send a private message' },
  { command: 'motd', description: 'view the message of the day' },
  { command: 'status <message|clear>', description: 'set your profile status' },
  { command: 'showstatus <username>', description: "view someone else's status" },
  { command: 'users', description: 'announce the number of connected users' },
  { command: 'search <text>', description: 'search for users whose name matches text' },
  { command: 'chat <message-id>', description: 'show a past message by its identifier' },
  { command: 'reply <message-id|r<reply-id>> <text>', description: 'reply to a message or reply' },
  { command: 'image <url> [caption]', description: 'share an image link' },
  { command: 'video <url> [caption]', description: 'share a video link' },
  { command: 'audio <url> [caption]', description: 'share an audio clip' },
  { command: 'files <url> [caption]', description: 'share a downloadable file' },
  { command: 'mail [inbox|send <user> <message>|clear]', description: 'manage your mailbox' },
  { command: 'profilepic', description: 'open the ASCII art profile picture composer' },
  { command: 'asciiart', description: 'open the ASCII art composer (max 128 lines, 1/10 min per IP)' },
  {
    command: 'game <tetris|liargame|alpha>',
    description: 'start a minigame in the chat (use /suspend! or Ctrl+Z to exit)'
  },
  { command: 'Up/Down arrows', description: 'scroll chat (chat mode) or browse command history (command mode)' },
  { command: 'color (text;highlight[;bold])', description: 'style your handle' },
  {
    command: 'systemcolor (fg;background[;highlight][;bold])',
    description: 'style the interface (use /systemcolor reset to restore defaults)'
  },
  { command: 'set-trans-lang <language|off>', description: 'translate terminal output to a target language' },
  { command: 'set-target-lang <language|off>', description: 'translate your outgoing messages' },
  { command: 'weather <region> <city>', description: 'show the weather for a region and city' },
  { command: 'translate <on|off>', description: 'enable or disable translation after configuring languages' },
  {
    command: 'translate-scope <chat|chat-nohistory|all>',
    description: 'limit translation to chat/BBS, optionally skipping scrollback (operator only)'
  },
  { command: 'gemini <on|off>', description: 'toggle Gemini provider (operator only)' },
  { command: 'gemini-unfreeze', description: 'clear automatic Gemini cooldown (operator only)' },
  { command: 'captcha <on|off>', description: 'toggle captcha requirement (operator only)' },
  { command: 'eliza <on|off>', description: 'toggle the Eliza moderator persona (operator only)' },
  { command: 'eliza-chat <message>', description: 'chat with Eliza using shared memories' },
  { command: 'chat-spacing <0-5>', description: 'reserve blank lines before translated captions in chat' },
  {
    command: 'mode <chat|command|toggle>',
    description: "switch between chat mode and command mode (no '/' needed in command mode)"
  },
  { command: 'palette <name>', description: 'apply a predefined interface palette (use “palette list” to explore)' },
  { command: 'today', description: "discover today's function (once per day)" },
  { command: 'date <timezone>', description: 'view the server time in another timezone' },
  { command: 'os <name>', description: 'record the operating system you use' },
  { command: 'getos <username>', description: "look up someone else's recorded operating system" },
  { command: 'birthday YYYY-MM-DD', description: 'register your birthday' },
  { command: 'soulmate', description: 'list users sharing your birthday' },
  { command: 'pair', description: 'list users sharing your recorded OS' },
  { command: 'connected', description: 'privately list everyone connected' },
  { command: 'alpha-centauri-landers', description: 'view the Immigrants’ Flag hall of fame' },
  { command: 'grant <ip>', description: 'grant operator access to an IP (LAN only)' },
  { command: 'revoke <ip>', description: "revoke an IP's operator access (LAN top admin)" },
  { command: 'poll <question>|<option...>', description: 'start or view a poll' },
  {
    command: 'vote <label> <question>|<option...>',
    description: 'start or inspect a multiple-choice named poll (use /vote @close <label> to end it)'
  },
  {
    command: 'vote-single <label> <question>|<option...>',
    description: 'start or inspect a single-choice named poll'
  },
  { command: 'elect <label> <choice>', description: 'vote in a named poll by label' },
  { command: 'poke <username>', description: 'send a bell to call a user' },
  { command: 'kick <username>', description: 'disconnect a user (operator only)' },
  { command: 'ban <username>', description: 'ban a user (operator only)' },
  { command: 'banname <nickname>', description: 'block a nickname (operator only)' },
  { command: 'banlist', description: 'list active bans (operator only)' },
  { command: 'delete-msg <id|start-end>', description: 'remove chat history messages (operator only)' },
  {
    command: 'block <user|ip>',
    description: 'hide messages from a user or IP locally (use “block list” to review)'
  },
  { command: 'unblock <target|all>', description: 'remove a local block entry' },
  { command: 'pardon <user|ip>', description: 'remove a ban (operator only)' },
  { command: 'good|sad|cool|angry|checked|love|wtf <id>', description: 'react to a message by number' },
  { command: '1 .. 5', description: 'vote for an option in the active poll' },
  {
    command: 'bbs [list|read|post|comment|regen|delete]',
    description: 'open the bulletin board system (finish >/__BBS_END> to post)'
  },
  { command: 'rss list', description: 'list saved RSS feeds' },
  { command: 'rss read <tag>', description: 'open a saved feed in the inline reader' },
  { command: 'rss add <url> <tag>', description: 'register a feed (operator only)' },
  { command: 'rss del <tag>', description: 'delete a feed (operator only)' },
  { command: 'suspend!', description: 'suspend the active game (Ctrl+Z while playing)' }
];

const renderCommandList = () =>
  commandEntries
    .map(
      (entry) => `
        <li class="cheatsheet__item">
          <code>${escapeHtml(entry.command)}</code>
          <span>${escapeHtml(entry.description)}</span>
        </li>
      `
    )
    .join('');

export const renderUtilityPanel = (_store: ChatStore, container: HTMLElement) => {
  container.innerHTML = `
    <div class="utility-sections utility-sections--wide">
      <section class="utility-section utility-section--wide">
        <header>
          <h3>Use the terminal CLI</h3>
          <p>All management now happens through command mode in the bridge.</p>
        </header>
        <p class="utility-section__lead"><code>/mode command</code> to use them!</p>
        <p class="utility-section__note">Quick command in chat mode: <code>/desired_command</code>.</p>
      </section>
      <section class="utility-section utility-section--wide">
        <header>
          <h3>Command reference</h3>
          <p>Scroll anywhere in this panel with your mouse wheel—no extra focus needed.</p>
        </header>
        <ul class="cheatsheet__list">
          ${renderCommandList()}
        </ul>
        <p class="utility-section__note">Regular messages are shared with everyone.</p>
      </section>
    </div>
  `;
};
