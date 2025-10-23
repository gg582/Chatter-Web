'use client';

import type { CSSProperties } from 'react';
import { useChatter } from '../context/ChatterContext';

const roomButtonStyle: CSSProperties = {
  width: '100%',
  textAlign: 'left',
  border: '1px solid transparent',
  borderRadius: '14px',
  padding: '0.8rem 1rem',
  background: 'rgba(30, 41, 59, 0.65)',
  color: '#e2e8f0',
  transition: 'transform 0.1s ease, border 0.2s ease',
  fontSize: '0.95rem'
};

export const RoomNavigator = () => {
  const { state, currentRoom, selectRoom } = useChatter();

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
          Rooms
        </h3>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'rgba(226, 232, 240, 0.6)' }}>
          Replacement for the <code style={{ color: '#f472b6' }}>/rooms</code> and{' '}
          <code style={{ color: '#f472b6' }}>/enter</code> commands.
        </p>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto' }}>
        {state.rooms.map((room) => {
          const isActive = currentRoom?.id === room.id;
          return (
            <button
              key={room.id}
              type="button"
              style={{
                ...roomButtonStyle,
                borderColor: isActive ? 'rgba(14, 165, 233, 0.7)' : 'transparent',
                transform: isActive ? 'translateX(6px)' : 'none'
              }}
              onClick={() => selectRoom(room.id)}
            >
              <strong style={{ display: 'block', marginBottom: '0.25rem', fontSize: '1rem' }}>{room.name}</strong>
              <span style={{ fontSize: '0.85rem', color: 'rgba(226, 232, 240, 0.6)' }}>{room.topic}</span>
            </button>
          );
        })}
        {state.rooms.length === 0 && (
          <p style={{ color: 'rgba(226, 232, 240, 0.6)', fontSize: '0.9rem' }}>No rooms defined.</p>
        )}
      </div>
    </section>
  );
};
