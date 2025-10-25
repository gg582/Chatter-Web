import { ChatStore } from '../state/chatStore.js';
import type { AttachmentKind, ReactionType } from '../state/types.js';
import { escapeHtml, formatRelative } from './helpers.js';

const reactionTypes: ReactionType[] = ['good', 'sad', 'cool', 'angry', 'checked', 'love', 'wtf'];
const paletteOptions = ['default', 'twilight', 'midnight', 'aurora', 'neon'];
const systemPresets: Record<string, { foreground: string; background: string; highlight: string; bold: boolean }> = {
  midnight: { foreground: '#c7d2fe', background: '#030712', highlight: '#38bdf8', bold: false },
  dusk: { foreground: '#f8fafc', background: '#1f2937', highlight: '#f472b6', bold: true },
  storm: { foreground: '#e0f2fe', background: '#020617', highlight: '#22d3ee', bold: false }
};
const languages = ['off', 'en', 'es', 'ko', 'ja', 'zh'];
const translationScopes: Array<'chat' | 'chat-nohistory' | 'all'> = ['chat', 'chat-nohistory', 'all'];
const attachmentLabels: Record<AttachmentKind, string> = {
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  file: 'File'
};

const parseDeleteInput = (value: string): string[] => {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }
  if (trimmed.includes('-')) {
    const [start, end] = trimmed.split('-').map((part) => part.trim());
    if (!start || !end) {
      return [trimmed];
    }
    const prefix = start.split('-')[0];
    const startNum = parseInt(start.split('-').pop() ?? '', 10);
    const endNum = parseInt(end.split('-').pop() ?? '', 10);
    if (Number.isNaN(startNum) || Number.isNaN(endNum) || startNum > endNum) {
      return [trimmed];
    }
    const ids: string[] = [];
    for (let index = startNum; index <= endNum; index += 1) {
      ids.push(`${prefix}-${index}`);
    }
    return ids;
  }
  return trimmed.split(/\s*,\s*/);
};

const formatList = (items: string[]): string =>
  items.length === 0 ? '<span class="feedback">None yet.</span>' : items.map((item) => `<span>${escapeHtml(item)}</span>`).join('');

const weatherSummary = (region: string, city: string) => {
  const adjectives = ['Clear skies', 'Light rain', 'Windy evening', 'Foggy dawn', 'Cloud bursts'];
  const temps = [18, 21, 9, 27, 14];
  const index = Math.abs(region.length * 7 + city.length * 13) % adjectives.length;
  return `${adjectives[index]} · ${temps[index]}°C`;
};

const todayFunctions = [
  'Compose a limerick that compiles to valid Brainf**k.',
  'Build a cellular automaton with no living neighbours.',
  'Map a telnet ANSI palette to CSS custom properties.',
  'Synchronise a game of /tetris over raw TCP sockets.',
  'Render the weather feed using only box-drawing characters.'
];

export const renderUtilityPanel = (store: ChatStore, container: HTMLElement) => {
  const state = store.snapshot();

  const attachmentLists = (Object.keys(state.mediaLibrary) as AttachmentKind[])
    .map((kind) => {
      const entries = state.mediaLibrary[kind];
      const content = entries.length
        ? `<ul class="cheatsheet__list">
            ${entries
              .map(
                (entry) => `
                <li class="cheatsheet__item">
                  <code>${escapeHtml(entry.id)}</code>
                  <span>${escapeHtml(entry.url)}${entry.caption ? ` — ${escapeHtml(entry.caption)}` : ''}</span>
                </li>
              `
              )
              .join('')}
          </ul>`
        : '<p class="feedback">No attachments yet.</p>';
      return `
        <div>
          <h4 style="margin:0;font-size:0.8rem;text-transform:uppercase;letter-spacing:0.1em;color:rgba(226,232,240,0.7)">
            ${attachmentLabels[kind]} uploads
          </h4>
          ${content}
        </div>
      `;
    })
    .join('');

  const pollBlocks = Object.values(state.polls)
    .map((poll) => {
      const optionsMarkup = poll.options
        .map(
          (option, index) => `
          <label style="display:flex;align-items:center;gap:0.5rem;font-size:0.8rem;">
            <input type="${poll.multiple ? 'checkbox' : 'radio'}" name="option" value="${escapeHtml(option.id)}" />
            <span>${escapeHtml(option.label)} · ${option.votes} votes</span>
            <button type="button" class="ghost" data-action="quick-vote" data-poll="${escapeHtml(
              poll.label
            )}" data-index="${index}">/${index + 1}</button>
          </label>
        `
        )
        .join('');
      return `
        <div class="utility-section" data-poll="${escapeHtml(poll.label)}">
          <header>
            <h3>${escapeHtml(poll.label)}</h3>
            <p>${escapeHtml(poll.question)}${poll.multiple ? ' (multiple choice)' : ''}</p>
          </header>
          <form class="form-grid" data-action="vote" data-poll="${escapeHtml(poll.label)}">
            ${optionsMarkup}
            <button type="submit">Submit vote</button>
            <p class="feedback" data-feedback="vote-${escapeHtml(poll.label)}"></p>
          </form>
        </div>
      `;
    })
    .join('');

  const rssList = state.rssFeeds
    .map(
      (feed) => `
        <div class="utility-section">
          <header>
            <h3>${escapeHtml(feed.tag)}</h3>
            <p>${escapeHtml(feed.url)}</p>
          </header>
          <ul class="cheatsheet__list">
            ${feed.entries
              .map(
                (entry) => `
                <li class="cheatsheet__item">
                  <strong>${escapeHtml(entry.title)}</strong>
                  <span>${escapeHtml(entry.url)}</span>
                  <span>${formatRelative(entry.publishedAt)}</span>
                </li>
              `
              )
              .join('')}
          </ul>
        </div>
      `
    )
    .join('');

  const bbsList = state.bbsThreads
    .map(
      (thread) => `
        <div class="utility-section" data-bbs="${escapeHtml(thread.id)}">
          <header>
            <h3>${escapeHtml(thread.title)}</h3>
            <p>Last update ${formatRelative(thread.updatedAt)} by ${escapeHtml(thread.author)}</p>
          </header>
          <p class="feedback">${escapeHtml(thread.body)}</p>
          <ul class="cheatsheet__list">
            ${thread.replies
              .map(
                (reply) => `
                <li class="cheatsheet__item">
                  <strong>${escapeHtml(reply.author)}</strong>
                  <span>${escapeHtml(reply.body)}</span>
                  <span>${formatRelative(reply.postedAt)}</span>
                </li>
              `
              )
              .join('')}
          </ul>
        </div>
      `
    )
    .join('');

  container.innerHTML = `
    <div class="utility-sections">
      <section class="utility-section" data-section="identity-profile">
        <header>
          <h3>Identity · /nick /status /os /birthday</h3>
          <p>Update the profile fields mirrored from the CLI.</p>
        </header>
        <form class="form-grid" data-action="set-nick">
          <label for="nick-input">Nickname</label>
          <input id="nick-input" name="nickname" value="${escapeHtml(state.currentUser.username)}" />
          <button type="submit">Update nickname</button>
          <p class="feedback" data-feedback="set-nick"></p>
        </form>
        <form class="form-grid" data-action="set-status">
          <label for="status-input">Status message</label>
          <input id="status-input" name="status" value="${escapeHtml(state.currentUser.status ?? '')}" placeholder="Type /status ..." />
          <div style="display:flex;gap:0.6rem;flex-wrap:wrap;">
            <button type="submit">Save status</button>
            <button type="button" data-action="clear-status">Clear status</button>
          </div>
          <p class="feedback" data-feedback="set-status"></p>
        </form>
        <form class="form-grid" data-action="set-os">
          <label for="os-input">Operating system</label>
          <input id="os-input" name="os" value="${escapeHtml(state.currentUser.os ?? '')}" placeholder="/os" />
          <button type="submit">Record OS</button>
          <p class="feedback" data-feedback="set-os"></p>
        </form>
        <form class="form-grid" data-action="set-birthday">
          <label for="birthday-input">Birthday</label>
          <input id="birthday-input" name="birthday" value="${escapeHtml(state.currentUser.birthday ?? '')}" placeholder="YYYY-MM-DD" />
          <button type="submit">Save birthday</button>
          <p class="feedback" data-feedback="set-birthday"></p>
        </form>
      </section>

      <section class="utility-section" data-section="identity-directory">
        <header>
          <h3>Directory · /showstatus /search /soulmate /pair /connected</h3>
          <p>Discover who is online and what they are up to.</p>
        </header>
        <form class="form-grid" data-action="show-status">
          <label for="status-lookup">Lookup status</label>
          <input id="status-lookup" name="username" placeholder="/showstatus" />
          <button type="submit">Show status</button>
          <p class="feedback" data-feedback="show-status"></p>
        </form>
        <form class="form-grid" data-action="lookup-os">
          <label for="os-lookup">Lookup operating system</label>
          <input id="os-lookup" name="username" placeholder="/getos" />
          <button type="submit">Show OS</button>
          <p class="feedback" data-feedback="lookup-os"></p>
        </form>
        <form class="form-grid" data-action="user-search">
          <label for="user-search-input">Search users</label>
          <input id="user-search-input" name="query" placeholder="/search" />
          <button type="submit">Search</button>
          <p class="feedback" data-feedback="user-search"></p>
        </form>
        <div>
          <h4 class="card__badge">Connected now</h4>
          <div class="badge-list">${formatList(state.connectedUsers)}</div>
        </div>
        <div>
          <button type="button" data-action="show-soulmates">Find /soulmate</button>
          <button type="button" data-action="show-pairs">Find /pair</button>
          <p class="feedback" data-feedback="matches"></p>
        </div>
      </section>

      <section class="utility-section" data-section="messaging">
        <header>
          <h3>Messaging · /pm /chat /reply /delete-msg /reactions</h3>
          <p>Private notes, history lookup, and moderation tools.</p>
        </header>
        <form class="form-grid" data-action="send-pm">
          <label for="pm-target">Recipient</label>
          <input id="pm-target" name="recipient" list="user-list" />
          <label for="pm-body">Message</label>
          <textarea id="pm-body" name="body" placeholder="/pm"></textarea>
          <button type="submit">Send private message</button>
          <p class="feedback" data-feedback="send-pm"></p>
        </form>
        <form class="form-grid" data-action="lookup-message">
          <label for="message-lookup">Message id</label>
          <input id="message-lookup" name="messageId" placeholder="m-1001" />
          <button type="submit">Lookup message</button>
          <p class="feedback" data-feedback="lookup-message"></p>
        </form>
        <form class="form-grid" data-action="delete-message">
          <label for="delete-input">Delete message ids or range</label>
          <input id="delete-input" name="ids" placeholder="m-1001,m-1002 or m-1001-m-1005" />
          <button type="submit">Delete messages</button>
          <p class="feedback" data-feedback="delete-message"></p>
        </form>
        <form class="form-grid" data-action="react-message">
          <label for="reaction-id">React to message</label>
          <input id="reaction-id" name="messageId" placeholder="m-1001" />
          <select name="reaction">
            ${reactionTypes.map((type) => `<option value="${type}">${type}</option>`).join('')}
          </select>
          <button type="submit">Add reaction</button>
          <p class="feedback" data-feedback="react-message"></p>
        </form>
      </section>

      <section class="utility-section" data-section="media">
        <header>
          <h3>Media · /image /video /audio /files /asciiart</h3>
          <p>Share links and maintain the attachment library.</p>
        </header>
        <form class="form-grid" data-action="add-attachment">
          <label for="attachment-type">Attachment type</label>
          <select id="attachment-type" name="type">
            ${Object.keys(attachmentLabels)
              .map((key) => `<option value="${key}">${attachmentLabels[key as AttachmentKind]}</option>`)
              .join('')}
          </select>
          <label for="attachment-url">URL</label>
          <input id="attachment-url" name="url" placeholder="https://" />
          <label for="attachment-caption">Caption</label>
          <input id="attachment-caption" name="caption" placeholder="Optional caption" />
          <button type="submit">Add attachment</button>
          <p class="feedback" data-feedback="add-attachment"></p>
        </form>
        ${attachmentLists}
        <form class="form-grid" data-action="save-asciiart">
          <label for="asciiart">ASCII art studio (/asciiart)</label>
          <textarea id="asciiart" name="art" placeholder="Compose up to 128 lines">${escapeHtml(state.asciiArtDraft)}</textarea>
          <button type="submit">Save draft</button>
          <p class="feedback" data-feedback="save-asciiart"></p>
        </form>
      </section>

      <section class="utility-section" data-section="appearance">
        <header>
          <h3>Appearance · /color /systemcolor /palette /translate</h3>
          <p>Match the CLI themes and translation helpers.</p>
        </header>
        <form class="form-grid" data-action="handle-color">
          <label for="handle-color">Handle colour</label>
          <input id="handle-color" type="color" name="color" value="${escapeHtml(state.handleColor)}" />
          <button type="submit">Update colour</button>
          <p class="feedback" data-feedback="handle-color"></p>
        </form>
        <form class="form-grid" data-action="palette">
          <label for="palette-select">Palette preset</label>
          <select id="palette-select" name="palette">
            ${paletteOptions
              .map((palette) => `<option value="${palette}" ${palette === state.palette ? 'selected' : ''}>${palette}</option>`)
              .join('')}
          </select>
          <button type="submit">Apply palette</button>
          <p class="feedback" data-feedback="palette"></p>
        </form>
        <form class="form-grid" data-action="systemcolor">
          <label for="system-select">System palette</label>
          <select id="system-select" name="preset">
            <option value="midnight">Midnight</option>
            <option value="dusk">Dusk</option>
            <option value="storm">Storm</option>
          </select>
          <button type="submit">Apply system colour</button>
          <p class="feedback" data-feedback="systemcolor"></p>
        </form>
        <form class="form-grid" data-action="translation">
          <label for="translate-enabled">Automatic translation (/translate)</label>
          <select id="translate-enabled" name="enabled">
            <option value="on" ${state.translation.enabled ? 'selected' : ''}>On</option>
            <option value="off" ${!state.translation.enabled ? 'selected' : ''}>Off</option>
          </select>
          <label for="trans-lang">Incoming language (/set-trans-lang)</label>
          <select id="trans-lang" name="source">
            ${languages
              .map((lang) => `<option value="${lang}" ${state.translation.sourceLang === lang ? 'selected' : ''}>${lang}</option>`)
              .join('')}
          </select>
          <label for="target-lang">Outgoing language (/set-target-lang)</label>
          <select id="target-lang" name="target">
            ${languages
              .map((lang) => `<option value="${lang}" ${state.translation.targetLang === lang ? 'selected' : ''}>${lang}</option>`)
              .join('')}
          </select>
          <label for="scope-select">Scope (/translate-scope)</label>
          <select id="scope-select" name="scope">
            ${translationScopes
              .map((scope) => `<option value="${scope}" ${state.translation.scope === scope ? 'selected' : ''}>${scope}</option>`)
              .join('')}
          </select>
          <label for="spacing-input">Caption spacing (/chat-spacing)</label>
          <input id="spacing-input" name="spacing" type="range" min="0" max="5" step="1" value="${state.translation.spacing}" />
          <button type="submit">Save translation settings</button>
          <p class="feedback" data-feedback="translation"></p>
        </form>
      </section>

      <section class="utility-section" data-section="assistants">
        <header>
          <h3>Assistants · /game /suspend! /gemini /eliza /today /date /weather</h3>
          <p>Run games, AI helpers, and daily curiosities.</p>
        </header>
        <form class="form-grid" data-action="set-game">
          <label for="game-select">Minigame</label>
          <select id="game-select" name="game">
            <option value="">None</option>
            <option value="tetris" ${state.activeGame === 'tetris' ? 'selected' : ''}>Tetris</option>
            <option value="liargame" ${state.activeGame === 'liargame' ? 'selected' : ''}>Liar Game</option>
            <option value="alpha" ${state.activeGame === 'alpha' ? 'selected' : ''}>Fly me to Alpha Centauri</option>
          </select>
          <div style="display:flex;gap:0.6rem;flex-wrap:wrap;">
            <button type="submit">Start game</button>
            <button type="button" data-action="suspend-game">Suspend (/suspend!)</button>
          </div>
          <p class="feedback">${state.activeGame ? `Running: ${state.activeGame}` : 'No active game.'}</p>
          <p class="feedback">
            Fly me to Alpha Centauri expects knowledge of the BBS navigation charts; review the docs before starting.
          </p>
          <p class="feedback" data-feedback="game"></p>
        </form>
        <div style="display:flex;gap:0.6rem;flex-wrap:wrap;">
          <button type="button" data-action="toggle-gemini" data-enabled="${state.geminiEnabled ? 'on' : 'off'}">
            ${state.geminiEnabled ? 'Disable /gemini' : 'Enable /gemini'}
          </button>
          <button type="button" data-action="unfreeze-gemini">/gemini-unfreeze</button>
          <button type="button" data-action="toggle-eliza" data-enabled="${state.elizaEnabled ? 'on' : 'off'}">
            ${state.elizaEnabled ? 'Disable /eliza' : 'Enable /eliza'}
          </button>
        </div>
        <p class="feedback">Gemini cooling: ${state.geminiCooling ? 'Cooling down' : 'Ready'}</p>
        <form class="form-grid" data-action="eliza-chat">
          <label for="eliza-input">Talk to Eliza</label>
          <input id="eliza-input" name="message" placeholder="/eliza-chat" />
          <button type="submit">Send to Eliza</button>
          <p class="feedback" data-feedback="eliza-chat"></p>
        </form>
        <div>
          <h4 class="card__badge">Eliza log</h4>
          <div class="badge-list">${formatList(state.elizaLog.slice(0, 4))}</div>
        </div>
        <div style="display:flex;gap:0.6rem;flex-wrap:wrap;">
          <button type="button" data-action="refresh-today">Run /today</button>
          <button type="button" data-action="refresh-timezone">Check /date</button>
          <button type="button" data-action="refresh-weather">Check /weather</button>
        </div>
        <p class="feedback">${state.todaySummary ? `Today's function: ${escapeHtml(state.todaySummary)}` : 'Run /today to discover the task.'}</p>
        <div>
          <h4 class="card__badge">Recent timezone lookups</h4>
          <ul class="cheatsheet__list">
            ${state.timezoneHistory
              .slice(0, 3)
              .map(
                (entry) => `
                <li class="cheatsheet__item">
                  <strong>${escapeHtml(entry.zone)}</strong>
                  <span>${escapeHtml(entry.time)}</span>
                  <span>${formatRelative(entry.id)}</span>
                </li>
              `
              )
              .join('')}
          </ul>
        </div>
        <div>
          <h4 class="card__badge">Recent weather lookups</h4>
          <ul class="cheatsheet__list">
            ${state.weatherHistory
              .slice(0, 3)
              .map(
                (entry) => `
                <li class="cheatsheet__item">
                  <strong>${escapeHtml(entry.location)}</strong>
                  <span>${escapeHtml(entry.summary)}</span>
                  <span>${formatRelative(entry.observedAt)}</span>
                </li>
              `
              )
              .join('')}
          </ul>
        </div>
        <p class="feedback" data-feedback="assistants"></p>
      </section>

      <section class="utility-section" data-section="moderation">
        <header>
          <h3>Moderation · /grant /revoke /ban /pardon /block /unblock /poke /kick /poll</h3>
          <p>Operator tools and community votes.</p>
        </header>
        <form class="form-grid" data-action="grant">
          <label for="grant-ip">Grant operator (/grant)</label>
          <input id="grant-ip" name="ip" placeholder="127.0.0.1" />
          <button type="submit">Grant access</button>
          <p class="feedback" data-feedback="grant"></p>
        </form>
        <form class="form-grid" data-action="revoke">
          <label for="revoke-ip">Revoke operator (/revoke)</label>
          <input id="revoke-ip" name="ip" placeholder="127.0.0.1" />
          <button type="submit">Revoke access</button>
          <p class="feedback" data-feedback="revoke"></p>
        </form>
        <div>
          <h4 class="card__badge">Operator IPs</h4>
          <div class="badge-list">${formatList(state.operatorIps)}</div>
        </div>
        <form class="form-grid" data-action="ban">
          <label for="ban-user">Ban user (/ban)</label>
          <input id="ban-user" name="username" placeholder="username" />
          <button type="submit">Ban</button>
          <p class="feedback" data-feedback="ban"></p>
        </form>
        <form class="form-grid" data-action="pardon">
          <label for="pardon-user">Pardon user (/pardon)</label>
          <input id="pardon-user" name="username" placeholder="username" />
          <button type="submit">Pardon</button>
          <p class="feedback" data-feedback="pardon"></p>
        </form>
        <div>
          <h4 class="card__badge">/banlist</h4>
          <div class="badge-list">${formatList(state.bannedUsers)}</div>
        </div>
        <form class="form-grid" data-action="block">
          <label for="block-target">Block target (/block)</label>
          <input id="block-target" name="target" placeholder="user or ip" />
          <button type="submit">Block</button>
          <p class="feedback" data-feedback="block"></p>
        </form>
        <form class="form-grid" data-action="unblock">
          <label for="unblock-target">Unblock target (/unblock)</label>
          <input id="unblock-target" name="target" placeholder="target or all" />
          <button type="submit">Unblock</button>
          <p class="feedback" data-feedback="unblock"></p>
        </form>
        <div>
          <h4 class="card__badge">Blocked targets</h4>
          <div class="badge-list">${formatList(state.blockedTargets)}</div>
        </div>
        <form class="form-grid" data-action="poke">
          <label for="poke-user">Poke user (/poke)</label>
          <input id="poke-user" name="username" placeholder="username" />
          <button type="submit">Poke</button>
          <p class="feedback" data-feedback="poke"></p>
        </form>
        <form class="form-grid" data-action="kick">
          <label for="kick-user">Kick user (/kick)</label>
          <input id="kick-user" name="username" placeholder="username" />
          <button type="submit">Kick</button>
          <p class="feedback" data-feedback="kick"></p>
        </form>
        <div>
          <h4 class="card__badge">Poke log</h4>
          <div class="badge-list">${formatList(state.pokeLog.slice(0, 5))}</div>
        </div>
        <form class="form-grid" data-action="create-poll">
          <label for="poll-label">Poll label</label>
          <input id="poll-label" name="label" placeholder="launch" />
          <label for="poll-question">Question</label>
          <input id="poll-question" name="question" placeholder="Where should we ..." />
          <label for="poll-options">Options (comma separated)</label>
          <input id="poll-options" name="options" placeholder="Option A, Option B" />
          <label><input type="checkbox" name="multiple" /> Allow multiple selections</label>
          <button type="submit">Save poll</button>
          <p class="feedback" data-feedback="create-poll"></p>
        </form>
        ${pollBlocks || '<p class="feedback">No polls yet.</p>'}
      </section>

      <section class="utility-section" data-section="feeds">
        <header>
          <h3>BBS & feeds · /bbs /rss</h3>
          <p>Long-form discussions and saved readers.</p>
        </header>
        <form class="form-grid" data-action="post-bbs">
          <label for="bbs-title">New bulletin (/bbs post)</label>
          <input id="bbs-title" name="title" placeholder="Thread title" />
          <label for="bbs-body">Body</label>
          <textarea id="bbs-body" name="body" placeholder="Thread content"></textarea>
          <button type="submit">Post thread</button>
          <p class="feedback" data-feedback="post-bbs"></p>
        </form>
        <form class="form-grid" data-action="comment-bbs">
          <label for="bbs-select">Comment on thread (/bbs comment)</label>
          <select id="bbs-select" name="threadId">
            ${state.bbsThreads.map((thread) => `<option value="${thread.id}">${escapeHtml(thread.title)}</option>`).join('')}
          </select>
          <textarea name="body" placeholder="Your comment"></textarea>
          <button type="submit">Add comment</button>
          <p class="feedback" data-feedback="comment-bbs"></p>
        </form>
        <div style="display:flex;gap:0.6rem;flex-wrap:wrap;">
          <button type="button" data-action="regen-bbs">/bbs regen</button>
          <button type="button" data-action="delete-bbs">/bbs delete</button>
        </div>
        <p class="feedback" data-feedback="bbs"></p>
        ${bbsList}
        <form class="form-grid" data-action="add-feed">
          <label for="feed-url">Add RSS feed (/rss add)</label>
          <input id="feed-url" name="url" placeholder="https://" />
          <label for="feed-tag">Tag</label>
          <input id="feed-tag" name="tag" placeholder="community" />
          <button type="submit">Save feed</button>
          <p class="feedback" data-feedback="add-feed"></p>
        </form>
        <form class="form-grid" data-action="read-feed">
          <label for="feed-select">Read feed (/rss read)</label>
          <select id="feed-select" name="tag">
            ${state.rssFeeds.map((feed) => `<option value="${feed.tag}">${escapeHtml(feed.tag)}</option>`).join('')}
          </select>
          <button type="submit">Open feed</button>
          <p class="feedback" data-feedback="read-feed"></p>
        </form>
        <div>
          <h4 class="card__badge">Saved feeds (/rss list)</h4>
          <div class="badge-list">${formatList(state.rssFeeds.map((feed) => feed.tag))}</div>
        </div>
        ${rssList}
      </section>
    </div>
    <datalist id="user-list">
      ${store.listUsers().map((user) => `<option value="${user}"></option>`).join('')}
    </datalist>
  `;

  const setFeedback = (key: string, message: string, type: 'success' | 'error' = 'success') => {
    const element = container.querySelector<HTMLParagraphElement>(`[data-feedback="${key}"]`);
    if (element) {
      element.textContent = message;
      element.classList.toggle('feedback--error', type === 'error');
      element.classList.toggle('feedback--success', type === 'success');
    }
  };

  const submitHandler = (event: SubmitEvent) => {
    const form = event.target as HTMLFormElement;
    const action = form.dataset.action;
    if (!action) {
      return;
    }
    event.preventDefault();
    const formData = new FormData(form);
    switch (action) {
      case 'set-nick': {
        const nickname = String(formData.get('nickname') ?? '');
        const result = store.renameUser(nickname);
        setFeedback('set-nick', result.ok ? result.message ?? 'Nickname updated.' : result.error ?? 'Failed.', result.ok ? 'success' : 'error');
        break;
      }
      case 'set-status': {
        const status = String(formData.get('status') ?? '');
        const result = store.setStatus(status);
        setFeedback('set-status', result.message ?? (result.ok ? 'Status updated.' : result.error ?? 'Failed.'), result.ok ? 'success' : 'error');
        break;
      }
      case 'set-os': {
        const os = String(formData.get('os') ?? '');
        const result = store.setOperatingSystem(os);
        setFeedback('set-os', result.ok ? result.message ?? 'OS saved.' : result.error ?? 'Failed.', result.ok ? 'success' : 'error');
        break;
      }
      case 'set-birthday': {
        const birthday = String(formData.get('birthday') ?? '');
        const result = store.setBirthday(birthday);
        setFeedback('set-birthday', result.ok ? result.message ?? 'Birthday saved.' : result.error ?? 'Failed.', result.ok ? 'success' : 'error');
        break;
      }
      case 'show-status': {
        const username = String(formData.get('username') ?? '');
        const status = store.getStatus(username.trim());
        setFeedback('show-status', status ? `${username}: ${status}` : 'No status on record.', status ? 'success' : 'error');
        break;
      }
      case 'lookup-os': {
        const username = String(formData.get('username') ?? '');
        const os = store.getOperatingSystem(username.trim());
        setFeedback('lookup-os', os ? `${username}: ${os}` : 'No OS recorded.', os ? 'success' : 'error');
        break;
      }
      case 'user-search': {
        const query = String(formData.get('query') ?? '');
        const matches = store.searchUsers(query);
        setFeedback('user-search', matches.length ? matches.join(', ') : 'No users matched.', matches.length ? 'success' : 'error');
        break;
      }
      case 'send-pm': {
        const recipient = String(formData.get('recipient') ?? '');
        const body = String(formData.get('body') ?? '');
        const result = store.recordPrivateMessage(recipient, body);
        setFeedback('send-pm', result.ok ? result.message ?? 'Private message sent.' : result.error ?? 'Failed.', result.ok ? 'success' : 'error');
        if (result.ok) {
          form.reset();
        }
        break;
      }
      case 'lookup-message': {
        const id = String(formData.get('messageId') ?? '');
        const message = store.getMessageById(id.trim());
        setFeedback('lookup-message', message ? `${message.author}: ${message.body}` : 'Message not found.', message ? 'success' : 'error');
        break;
      }
      case 'delete-message': {
        const ids = parseDeleteInput(String(formData.get('ids') ?? ''));
        const result = store.deleteMessages(ids);
        setFeedback('delete-message', result.ok ? 'Messages deleted.' : result.error ?? 'Failed.', result.ok ? 'success' : 'error');
        break;
      }
      case 'react-message': {
        const id = String(formData.get('messageId') ?? '');
        const reaction = String(formData.get('reaction') ?? 'good') as ReactionType;
        const result = store.reactToMessage(id, reaction);
        setFeedback('react-message', result.ok ? result.message ?? 'Reaction added.' : result.error ?? 'Failed.', result.ok ? 'success' : 'error');
        break;
      }
      case 'add-attachment': {
        const type = String(formData.get('type') ?? 'image') as AttachmentKind;
        const url = String(formData.get('url') ?? '');
        const caption = String(formData.get('caption') ?? '');
        const result = store.addAttachment(type, url, caption);
        setFeedback('add-attachment', result.ok ? result.message ?? 'Attachment saved.' : result.error ?? 'Failed.', result.ok ? 'success' : 'error');
        if (result.ok) {
          form.reset();
        }
        break;
      }
      case 'save-asciiart': {
        const art = String(formData.get('art') ?? '');
        store.updateAsciiArt(art);
        setFeedback('save-asciiart', 'ASCII art saved.', 'success');
        break;
      }
      case 'handle-color': {
        const color = String(formData.get('color') ?? '#38bdf8');
        store.setHandleColor(color);
        setFeedback('handle-color', 'Handle colour updated.', 'success');
        break;
      }
      case 'palette': {
        const palette = String(formData.get('palette') ?? 'default');
        store.setPalette(palette);
        setFeedback('palette', `Palette set to ${palette}.`, 'success');
        break;
      }
      case 'systemcolor': {
        const preset = String(formData.get('preset') ?? 'midnight');
        const values = systemPresets[preset];
        if (values) {
          store.setSystemPalette(values);
          setFeedback('systemcolor', `System palette updated (${preset}).`, 'success');
        } else {
          setFeedback('systemcolor', 'Preset not found.', 'error');
        }
        break;
      }
      case 'translation': {
        const enabled = String(formData.get('enabled') ?? 'off') === 'on';
        const source = String(formData.get('source') ?? 'off');
        const target = String(formData.get('target') ?? 'off');
        const scope = String(formData.get('scope') ?? 'chat') as 'chat' | 'chat-nohistory' | 'all';
        const spacing = Number(formData.get('spacing') ?? state.translation.spacing);
        store.updateTranslation({ enabled, sourceLang: source, targetLang: target, scope, spacing });
        setFeedback('translation', 'Translation settings saved.', 'success');
        break;
      }
      case 'set-game': {
        const game = String(formData.get('game') ?? '') as '' | 'tetris' | 'liargame' | 'alpha';
        store.setActiveGame(game);
        setFeedback('game', game ? `Started ${game}.` : 'Game cleared.', 'success');
        break;
      }
      case 'eliza-chat': {
        const message = String(formData.get('message') ?? '');
        const reply = store.elizaChat(message);
        setFeedback('eliza-chat', reply, 'success');
        form.reset();
        break;
      }
      case 'grant': {
        const ip = String(formData.get('ip') ?? '');
        const result = store.grantOperator(ip);
        setFeedback('grant', result.ok ? result.message ?? 'Granted.' : result.error ?? 'Failed.', result.ok ? 'success' : 'error');
        break;
      }
      case 'revoke': {
        const ip = String(formData.get('ip') ?? '');
        const result = store.revokeOperator(ip);
        setFeedback('revoke', result.ok ? result.message ?? 'Revoked.' : result.error ?? 'Failed.', result.ok ? 'success' : 'error');
        break;
      }
      case 'ban': {
        const username = String(formData.get('username') ?? '');
        const result = store.banUser(username);
        setFeedback('ban', result.ok ? result.message ?? 'User banned.' : result.error ?? 'Failed.', result.ok ? 'success' : 'error');
        break;
      }
      case 'pardon': {
        const username = String(formData.get('username') ?? '');
        const result = store.pardonTarget(username);
        setFeedback('pardon', result.ok ? result.message ?? 'Pardon successful.' : result.error ?? 'Failed.', result.ok ? 'success' : 'error');
        break;
      }
      case 'block': {
        const target = String(formData.get('target') ?? '');
        const result = store.blockTarget(target);
        setFeedback('block', result.ok ? result.message ?? 'Blocked.' : result.error ?? 'Failed.', result.ok ? 'success' : 'error');
        break;
      }
      case 'unblock': {
        const target = String(formData.get('target') ?? '');
        const result = store.unblockTarget(target);
        setFeedback('unblock', result.ok ? result.message ?? 'Unblocked.' : result.error ?? 'Failed.', result.ok ? 'success' : 'error');
        break;
      }
      case 'poke': {
        const user = String(formData.get('username') ?? '');
        const result = store.pokeUser(user);
        setFeedback('poke', result.ok ? result.message ?? 'Poke sent.' : result.error ?? 'Failed.', result.ok ? 'success' : 'error');
        break;
      }
      case 'kick': {
        const user = String(formData.get('username') ?? '');
        const result = store.kickUser(user);
        setFeedback('kick', result.ok ? result.message ?? 'User kicked.' : result.error ?? 'Failed.', result.ok ? 'success' : 'error');
        break;
      }
      case 'create-poll': {
        const label = String(formData.get('label') ?? '');
        const question = String(formData.get('question') ?? '');
        const options = String(formData.get('options') ?? '').split(',');
        const multiple = formData.get('multiple') === 'on';
        const result = store.createPoll(label, question, options, multiple);
        setFeedback('create-poll', result.ok ? result.message ?? 'Poll saved.' : result.error ?? 'Failed.', result.ok ? 'success' : 'error');
        if (result.ok) {
          form.reset();
        }
        break;
      }
      case 'vote': {
        const label = form.dataset.poll ?? '';
        const choices = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="option"]'))
          .filter((input) => input.checked)
          .map((input) => input.value);
        const result = store.vote(label, choices);
        setFeedback(`vote-${label}`, result.ok ? result.message ?? 'Vote recorded.' : result.error ?? 'Failed.', result.ok ? 'success' : 'error');
        break;
      }
      case 'post-bbs': {
        const title = String(formData.get('title') ?? '');
        const body = String(formData.get('body') ?? '');
        const result = store.postBbsThread(title, body);
        setFeedback('post-bbs', result.ok ? result.message ?? 'Thread posted.' : result.error ?? 'Failed.', result.ok ? 'success' : 'error');
        if (result.ok) {
          form.reset();
        }
        break;
      }
      case 'comment-bbs': {
        const threadId = String(formData.get('threadId') ?? '');
        const body = String(formData.get('body') ?? '');
        const result = store.commentOnBbs(threadId, body);
        setFeedback('comment-bbs', result.ok ? result.message ?? 'Comment added.' : result.error ?? 'Failed.', result.ok ? 'success' : 'error');
        if (result.ok) {
          form.reset();
        }
        break;
      }
      case 'add-feed': {
        const url = String(formData.get('url') ?? '');
        const tag = String(formData.get('tag') ?? '');
        const result = store.addRssFeed(url, tag);
        setFeedback('add-feed', result.ok ? result.message ?? 'Feed saved.' : result.error ?? 'Failed.', result.ok ? 'success' : 'error');
        if (result.ok) {
          form.reset();
        }
        break;
      }
      case 'read-feed': {
        const tag = String(formData.get('tag') ?? '');
        const feed = store.readFeed(tag);
        setFeedback('read-feed', feed ? `${tag}: ${feed.entries.length} entries` : 'Feed not found.', feed ? 'success' : 'error');
        break;
      }
      default:
        break;
    }
  };

  const clickHandler = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    const action = target.dataset.action;
    if (!action) {
      return;
    }
    switch (action) {
      case 'clear-status': {
        event.preventDefault();
        const result = store.setStatus(null);
        setFeedback('set-status', result.message ?? 'Status cleared.', 'success');
        break;
      }
      case 'show-soulmates': {
        event.preventDefault();
        const matches = store.findSoulmates();
        setFeedback('matches', matches.length ? `Soulmates: ${matches.join(', ')}` : 'No birthday matches.', matches.length ? 'success' : 'error');
        break;
      }
      case 'show-pairs': {
        event.preventDefault();
        const matches = store.findOsPairs();
        setFeedback('matches', matches.length ? `OS pairs: ${matches.join(', ')}` : 'No OS matches.', matches.length ? 'success' : 'error');
        break;
      }
      case 'suspend-game': {
        event.preventDefault();
        store.suspendGame();
        setFeedback('game', 'Game suspended.', 'success');
        break;
      }
      case 'toggle-gemini': {
        event.preventDefault();
        const enabled = target.dataset.enabled === 'on';
        store.setGeminiEnabled(!enabled);
        break;
      }
      case 'unfreeze-gemini': {
        event.preventDefault();
        store.unfreezeGemini();
        setFeedback('assistants', 'Gemini cooldown cleared.', 'success');
        break;
      }
      case 'toggle-eliza': {
        event.preventDefault();
        const enabled = target.dataset.enabled === 'on';
        store.setElizaEnabled(!enabled);
        setFeedback('assistants', `${!enabled ? 'Eliza enabled.' : 'Eliza disabled.'}`, 'success');
        break;
      }
      case 'refresh-today': {
        event.preventDefault();
        const summary = todayFunctions[Math.floor(Math.random() * todayFunctions.length)];
        store.updateToday(summary);
        setFeedback('assistants', summary, 'success');
        break;
      }
      case 'refresh-timezone': {
        event.preventDefault();
        const zone = prompt('Enter timezone (e.g. UTC, Europe/Berlin):', 'UTC') ?? 'UTC';
        try {
          const formatter = new Intl.DateTimeFormat('en', { timeZone: zone, dateStyle: 'medium', timeStyle: 'short' });
          const time = formatter.format(new Date());
          store.recordTimezone({ id: new Date().toISOString(), zone, time });
          setFeedback('assistants', `Current time in ${zone}: ${time}`, 'success');
        } catch (error) {
          setFeedback('assistants', 'Invalid timezone.', 'error');
        }
        break;
      }
      case 'refresh-weather': {
        event.preventDefault();
        const region = prompt('Region (e.g. us):', 'us') ?? 'us';
        const city = prompt('City:', 'seattle') ?? 'seattle';
        const summary = weatherSummary(region, city);
        store.recordWeather({
          id: new Date().toISOString(),
          location: `${region}/${city}`,
          summary,
          observedAt: new Date().toISOString()
        });
        setFeedback('assistants', `${region}/${city}: ${summary}`, 'success');
        break;
      }
      case 'quick-vote': {
        event.preventDefault();
        const poll = target.dataset.poll ?? '';
        const index = Number(target.dataset.index ?? '0');
        const result = store.quickVote(poll, index);
        setFeedback(`vote-${poll}`, result.ok ? result.message ?? 'Vote recorded.' : result.error ?? 'Failed.', result.ok ? 'success' : 'error');
        break;
      }
      case 'regen-bbs': {
        event.preventDefault();
        store.regenBbs();
        setFeedback('bbs', 'Bulletin regenerated.', 'success');
        break;
      }
      case 'delete-bbs': {
        event.preventDefault();
        const threadId = prompt('Thread id to delete:', state.bbsThreads[0]?.id ?? '') ?? '';
        if (!threadId) {
          return;
        }
        const result = store.deleteBbs(threadId);
        setFeedback('bbs', result.ok ? result.message ?? 'Thread deleted.' : result.error ?? 'Failed.', result.ok ? 'success' : 'error');
        break;
      }
      default:
        break;
    }
  };

  const previousSubmit = (container as unknown as { __utilitySubmit?: EventListener }).__utilitySubmit;
  if (previousSubmit) {
    container.removeEventListener('submit', previousSubmit);
  }
  container.addEventListener('submit', submitHandler as EventListener);
  (container as unknown as { __utilitySubmit?: EventListener }).__utilitySubmit = submitHandler as EventListener;

  const previousClick = (container as unknown as { __utilityClick?: EventListener }).__utilityClick;
  if (previousClick) {
    container.removeEventListener('click', previousClick);
  }
  container.addEventListener('click', clickHandler as EventListener);
  (container as unknown as { __utilityClick?: EventListener }).__utilityClick = clickHandler as EventListener;
};
