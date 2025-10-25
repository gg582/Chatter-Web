import { commandGroups } from '../data/commandCatalog.js';
import { basicCommands } from '../data/basicCommands.js';
import { escapeHtml } from './helpers.js';

export const renderCheatSheet = (container: HTMLElement) => {
  const basicSet = new Set(basicCommands);

  const basicGroups = commandGroups
    .map((group) => ({
      ...group,
      commands: group.commands.filter((command) => basicSet.has(command.command))
    }))
    .filter((group) => group.commands.length > 0);

  const advancedGroups = commandGroups
    .map((group) => ({
      ...group,
      commands: group.commands.filter((command) => !basicSet.has(command.command))
    }))
    .filter((group) => group.commands.length > 0);

  const renderBasicSection = () => {
    if (basicGroups.length === 0) {
      return '';
    }

    return `
      <section class="cheatsheet__section">
        <header class="cheatsheet__header">
          <h3>Basic commands</h3>
          <p>Quick access to the everyday actions you already use from the CLI.</p>
        </header>
        ${basicGroups
          .map(
            (group) => `
              <details>
                <summary>
                  <h4>${escapeHtml(group.title)}</h4>
                  <p>${escapeHtml(group.summary)}</p>
                </summary>
                <ul class="cheatsheet__list">
                  ${group.commands
                    .map(
                      (command) => `
                      <li class="cheatsheet__item">
                        <code>${escapeHtml(command.command)}</code>
                        <span>${escapeHtml(command.description)}</span>
                        <span>${escapeHtml(command.ui)}</span>
                      </li>
                    `
                    )
                    .join('')}
                </ul>
              </details>
            `
          )
          .join('')}
      </section>
    `;
  };

  const renderAdvancedSection = () => {
    if (advancedGroups.length === 0) {
      return '';
    }

    return `
      <section class="cheatsheet__section cheatsheet__section--terminal">
        <header class="cheatsheet__header">
          <h3>Advanced commands</h3>
          <p>Reference every extended workflow through a terminal-style view.</p>
        </header>
        <div class="cheatsheet-terminal">
          <div class="cheatsheet-terminal__header">
            <span class="cheatsheet-terminal__dot"></span>
            <span class="cheatsheet-terminal__dot"></span>
            <span class="cheatsheet-terminal__dot"></span>
            <strong>web-terminal</strong>
          </div>
          <div class="cheatsheet-terminal__body">
            ${advancedGroups
              .map(
                (group) => `
                  <div class="cheatsheet-terminal__block">
                    <div class="cheatsheet-terminal__comment">## ${escapeHtml(group.title)}</div>
                    <div class="cheatsheet-terminal__comment"># ${escapeHtml(group.summary)}</div>
                    ${group.commands
                      .map(
                        (command) => `
                          <div class="cheatsheet-terminal__line">
                            <span class="cheatsheet-terminal__prompt">$</span>
                            <span class="cheatsheet-terminal__command">${escapeHtml(command.command)}</span>
                          </div>
                          <div class="cheatsheet-terminal__comment"># ${escapeHtml(command.description)}</div>
                          <div class="cheatsheet-terminal__comment"># GUI → ${escapeHtml(command.ui)}</div>
                        `
                      )
                      .join('')}
                  </div>
                `
              )
              .join('')}
          </div>
        </div>
      </section>
    `;
  };

  container.innerHTML = `
    <div class="cheatsheet">
      ${renderBasicSection()}
      ${renderAdvancedSection()}
    </div>
  `;
};
