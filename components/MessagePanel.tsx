'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';
import { useChatter } from '../context/ChatterContext';
import { formatDateTime } from '../lib/format';

export const MessagePanel = () => {
  const { currentThread, replyToThread, state } = useChatter();
  const [message, setMessage] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!currentThread) {
    return (
      <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
        <header>
          <h3 style={{ marginTop: 0, color: '#f8fafc' }}>Messages</h3>
          <p style={{ color: 'rgba(226, 232, 240, 0.7)' }}>
            Choose a thread to view the conversation or use the thread form to start one.
          </p>
        </header>
      </section>
    );
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFeedback(null);

    const result = await replyToThread(message);
    if (!result.ok) {
      setFeedback(result.error ?? 'Failed to post reply.');
      return;
    }

    setMessage('');
  };

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
          {currentThread.title}
        </h3>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'rgba(226, 232, 240, 0.6)' }}>
          Mirrors the CLI <code style={{ color: '#f472b6' }}>/open</code> and <code style={{ color: '#f472b6' }}>/reply</code>{' '}
          commands.
        </p>
      </header>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          paddingRight: '0.5rem'
        }}
      >
        {currentThread.messages.map((entry) => (
          <article
            key={entry.id}
            style={{
              background: 'rgba(15, 23, 42, 0.55)',
              border: '1px solid rgba(148, 163, 184, 0.25)',
              borderRadius: '14px',
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <strong style={{ fontSize: '1rem', color: '#bae6fd' }}>{entry.author}</strong>
              <span style={{ fontSize: '0.8rem', color: 'rgba(226, 232, 240, 0.5)' }}>
                {formatDateTime(entry.postedAt)}
              </span>
            </div>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{entry.body}</p>
          </article>
        ))}
      </div>

      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          background: 'rgba(15, 23, 42, 0.55)',
          borderRadius: '14px',
          padding: '1rem',
          border: '1px solid rgba(148, 163, 184, 0.25)'
        }}
      >
        {!state.currentUser && (
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#fca5a5' }}>
            Log in to participate in this discussion.
          </p>
        )}
        <textarea
          style={{
            background: 'rgba(30, 41, 59, 0.7)',
            border: '1px solid rgba(148, 163, 184, 0.3)',
            borderRadius: '10px',
            padding: '0.65rem 0.8rem',
            minHeight: '110px',
            color: '#f8fafc',
            resize: 'vertical'
          }}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Write a reply"
        />
        <button
          type="submit"
          style={{
            borderRadius: '9999px',
            border: 'none',
            padding: '0.6rem 1rem',
            fontWeight: 600,
            fontSize: '0.9rem',
            background: 'linear-gradient(135deg, #38bdf8 0%, #818cf8 100%)',
            color: '#0f172a'
          }}
          disabled={!state.currentUser}
        >
          Post reply
        </button>
        {feedback && <p style={{ margin: 0, color: '#fca5a5', fontSize: '0.85rem' }}>{feedback}</p>}
      </form>
    </section>
  );
};
