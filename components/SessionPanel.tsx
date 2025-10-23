'use client';

import type { CSSProperties, FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { useChatter } from '../context/ChatterContext';

const fieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem'
};

const labelStyle: CSSProperties = {
  fontSize: '0.8rem',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'rgba(226, 232, 240, 0.6)'
};

const inputStyle: CSSProperties = {
  backgroundColor: 'rgba(30, 41, 59, 0.85)',
  border: '1px solid rgba(148, 163, 184, 0.35)',
  borderRadius: '10px',
  padding: '0.65rem 0.8rem',
  color: '#e2e8f0',
  outline: 'none',
  fontSize: '0.95rem'
};

const buttonStyle: CSSProperties = {
  borderRadius: '9999px',
  border: 'none',
  padding: '0.6rem 1rem',
  fontWeight: 600,
  fontSize: '0.9rem',
  background: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)',
  color: '#0f172a'
};

export const SessionPanel = () => {
  const { state, login, register, logout } = useChatter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [bio, setBio] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const isAuthenticated = Boolean(state.currentUser);

  const onlineUsers = useMemo(() => {
    if (!state.currentRoomId) {
      return [];
    }
    return state.activeUsersByRoom[state.currentRoomId] ?? [];
  }, [state.activeUsersByRoom, state.currentRoomId]);

  const resetForm = () => {
    setUsername('');
    setPassword('');
    setBio('');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFeedback(null);

    if (mode === 'login') {
      const result = await login(username, password);
      if (!result.ok) {
        setFeedback(result.error ?? 'Unable to log in.');
        return;
      }
      resetForm();
    } else {
      const result = await register(username, password, bio);
      if (!result.ok) {
        setFeedback(result.error ?? 'Unable to register.');
        return;
      }
      resetForm();
    }
  };

  return (
    <section>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
        <header style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.3rem', color: '#f8fafc' }}>Session</h3>
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'rgba(226, 232, 240, 0.65)' }}>
            Mirror of the CLI <code style={{ color: '#f472b6' }}>/login</code>,{' '}
            <code style={{ color: '#f472b6' }}>/register</code>, and <code style={{ color: '#f472b6' }}>/whoami</code>{' '}
            commands.
          </p>
        </header>

        {isAuthenticated ? (
          <article
            style={{
              background: 'rgba(30, 41, 59, 0.7)',
              borderRadius: '14px',
              padding: '1rem',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem'
            }}
          >
            <div>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontSize: '0.85rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: '#38bdf8'
                }}
              >
                Logged in as
              </span>
              <h4 style={{ margin: '0.3rem 0 0', fontSize: '1.4rem' }}>{state.currentUser?.username}</h4>
            </div>
            {state.currentUser?.bio && (
              <p style={{ margin: 0, fontSize: '0.95rem', color: 'rgba(226, 232, 240, 0.75)' }}>
                {state.currentUser.bio}
              </p>
            )}
            <button style={buttonStyle} onClick={logout} type="button">
              Log out
            </button>
          </article>
        ) : (
          <form
            onSubmit={handleSubmit}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.9rem',
              background: 'rgba(30, 41, 59, 0.7)',
              borderRadius: '14px',
              padding: '1rem',
              border: '1px solid rgba(148, 163, 184, 0.3)'
            }}
          >
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setFeedback(null);
                }}
                style={{
                  ...buttonStyle,
                  background: mode === 'login' ? buttonStyle.background : 'rgba(148, 163, 184, 0.2)',
                  color: mode === 'login' ? '#0f172a' : '#e2e8f0',
                  flex: 1
                }}
              >
                Log in
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setFeedback(null);
                }}
                style={{
                  ...buttonStyle,
                  background: mode === 'register' ? buttonStyle.background : 'rgba(148, 163, 184, 0.2)',
                  color: mode === 'register' ? '#0f172a' : '#e2e8f0',
                  flex: 1
                }}
              >
                Sign up
              </button>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle} htmlFor="username">
                Username
              </label>
              <input
                id="username"
                style={inputStyle}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Handle"
                autoComplete="username"
                required
              />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle} htmlFor="password">
                Password
              </label>
              <input
                id="password"
                style={inputStyle}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
              />
            </div>
            {mode === 'register' && (
              <div style={fieldStyle}>
                <label style={labelStyle} htmlFor="bio">
                  Bio (optional)
                </label>
                <textarea
                  id="bio"
                  style={{
                    ...inputStyle,
                    resize: 'vertical',
                    minHeight: '72px'
                  }}
                  value={bio}
                  onChange={(event) => setBio(event.target.value)}
                  placeholder="Share a short intro"
                />
              </div>
            )}
            <button type="submit" style={buttonStyle}>
              {mode === 'login' ? 'Enter BBS' : 'Create account'}
            </button>
            {feedback && (
              <p style={{ color: '#fca5a5', margin: 0, fontSize: '0.9rem' }}>{feedback}</p>
            )}
          </form>
        )}

        <div>
          <h4 style={{ margin: '0 0 0.5rem', textTransform: 'uppercase', fontSize: '0.85rem' }}>
            Room participants
          </h4>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {onlineUsers.map((user) => (
              <li
                key={user}
                style={{
                  background: 'rgba(148, 163, 184, 0.15)',
                  borderRadius: '9999px',
                  padding: '0.35rem 0.7rem',
                  fontSize: '0.85rem'
                }}
              >
                {user}
              </li>
            ))}
            {onlineUsers.length === 0 && (
              <li style={{ color: 'rgba(226, 232, 240, 0.5)', fontSize: '0.85rem' }}>No one is online.</li>
            )}
          </ul>
        </div>
      </div>
    </section>
  );
};
