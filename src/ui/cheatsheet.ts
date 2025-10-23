import { commandGroups } from '../data/commandCatalog';
import { escapeHtml } from './helpers';

export const renderCheatSheet = (container: HTMLElement) => {
  container.innerHTML = `
    <div class="cheatsheet">
      ${commandGroups
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
    </div>
  `;
};
