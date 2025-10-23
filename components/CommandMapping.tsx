'use client';

import { cliCommandMappings } from '../data/cliCommands';

export const CommandMapping = () => {
  return (
    <section
      style={{
        background: 'rgba(15, 23, 42, 0.55)',
        borderRadius: '14px',
        padding: '1.25rem',
        border: '1px solid rgba(148, 163, 184, 0.25)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem'
      }}
    >
      <header>
        <h3 style={{ margin: 0, fontSize: '1rem', color: '#bae6fd', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          CLI to GUI cheat sheet
        </h3>
        <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', color: 'rgba(226, 232, 240, 0.65)' }}>
          Keep this open to learn how each shell command maps to the interface.
        </p>
      </header>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.75rem' }}>
        {cliCommandMappings.map((item) => (
          <li
            key={item.command}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.2rem',
              background: 'rgba(30, 41, 59, 0.55)',
              borderRadius: '12px',
              padding: '0.85rem 1rem',
              border: '1px solid rgba(148, 163, 184, 0.3)'
            }}
          >
            <code style={{ color: '#f472b6', fontSize: '0.9rem' }}>{item.command}</code>
            <span style={{ fontSize: '0.85rem', color: 'rgba(226, 232, 240, 0.8)' }}>{item.description}</span>
            <span style={{ fontSize: '0.8rem', color: 'rgba(148, 163, 184, 0.8)' }}>{item.uiPath}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};
