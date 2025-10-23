'use client';

import type { CSSProperties, FormEvent } from 'react';
import { useState } from 'react';
import { useChatter } from '../context/ChatterContext';
import { formatDateTime } from '../lib/format';

const threadButtonStyle: CSSProperties = {
  width: '100%',
  textAlign: 'left',
  borderRadius: '14px',
  border: '1px solid rgba(148, 163, 184, 0.25)',
  background: 'rgba(15, 23, 42, 0.45)',
  padding: '0.9rem 1rem',
  color: '#e2e8f0',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.4rem'
};

export const ThreadPanel = () => {
  const { currentRoom, currentThread, selectThread, createThread, state } = useChatter();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!currentRoom) {
    return (
      <section>
        <h3 style={{ marginTop: 0, color: '#f8fafc' }}>Threads</h3>
        <p style={{ color: 'rgba(226, 232, 240, 0.7)' }}>Select a room to browse discussions.</p>
      </section>
    );
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFeedback(null);

    const result = await createThread(title, message);
    if (!result.ok) {
      setFeedback(result.error ?? 'Could not create thread.');
      return;
    }

    setTitle('');
    setMessage('');
  };

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
          Threads
        </h3>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'rgba(226, 232, 240, 0.6)' }}>
          Equivalent to <code style={{ color: '#f472b6' }}>/threads</code>, <code style={{ color: '#f472b6' }}>/open</code>,
          and <code style={{ color: '#f472b6' }}>/post</code> commands.
        </p>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', overflowY: 'auto' }}>
        {currentRoom.threads.map((thread) => {
          const isActive = currentThread?.id === thread.id;
          return (
            <button
              key={thread.id}
              type="button"
              style={{
                ...threadButtonStyle,
                borderColor: isActive ? 'rgba(14, 165, 233, 0.7)' : 'rgba(148, 163, 184, 0.25)',
                background: isActive ? 'rgba(30, 64, 175, 0.4)' : threadButtonStyle.background
              }}
              onClick={() => selectThread(thread.id)}
            >
              <strong style={{ fontSize: '1rem' }}>{thread.title}</strong>
              <span style={{ fontSize: '0.85rem', color: 'rgba(226, 232, 240, 0.6)' }}>
                Started by {thread.author} • {formatDateTime(thread.createdAt)}
              </span>
              <span style={{ fontSize: '0.8rem', color: 'rgba(226, 232, 240, 0.5)' }}>
                {thread.messages.length} message{thread.messages.length === 1 ? '' : 's'}
              </span>
            </button>
          );
        })}
        {currentRoom.threads.length === 0 && (
          <p style={{ color: 'rgba(226, 232, 240, 0.7)', fontSize: '0.9rem' }}>
            This room is waiting for the first conversation. Start one below!
          </p>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.8rem',
          background: 'rgba(15, 23, 42, 0.55)',
          borderRadius: '14px',
          padding: '1rem',
          border: '1px solid rgba(148, 163, 184, 0.25)'
        }}
      >
        <h4 style={{ margin: 0, fontSize: '1rem' }}>Start a new thread</h4>
        {!state.currentUser && (
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#fca5a5' }}>
            Log in to create new conversations.
          </p>
        )}
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.85rem' }}>
          Subject
          <input
            style={{
              background: 'rgba(30, 41, 59, 0.7)',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              borderRadius: '10px',
              padding: '0.65rem 0.8rem',
              color: '#f8fafc'
            }}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Thread title"
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.85rem' }}>
          Opening message
          <textarea
            style={{
              background: 'rgba(30, 41, 59, 0.7)',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              borderRadius: '10px',
              padding: '0.65rem 0.8rem',
              minHeight: '120px',
              color: '#f8fafc',
              resize: 'vertical'
            }}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Kick off the discussion"
          />
        </label>
        <button
          type="submit"
          style={{
            borderRadius: '9999px',
            border: 'none',
            padding: '0.6rem 1rem',
            fontWeight: 600,
            fontSize: '0.9rem',
            background: 'linear-gradient(135deg, #22d3ee 0%, #6366f1 100%)',
            color: '#0f172a'
          }}
          disabled={!state.currentUser}
        >
          Publish thread
        </button>
        {feedback && <p style={{ margin: 0, color: '#fca5a5', fontSize: '0.85rem' }}>{feedback}</p>}
      </form>
    </section>
  );
};
