import { describe, expect, test } from 'vitest';
import { ChatStore } from '../src/state/chatStore';
import { seedState } from '../src/state/seed';

const createStore = () => new ChatStore(seedState);

describe('ChatStore messaging helpers', () => {
  test('getMessageById returns seeded message', () => {
    const store = createStore();
    const message = store.getMessageById('m-1001');
    expect(message?.author).toBe('admin');
  });

  test('reactToMessage increments reaction counts', () => {
    const store = createStore();
    const result = store.reactToMessage('m-1001', 'good');
    expect(result.ok).toBe(true);
    const message = store.getMessageById('m-1001');
    expect(message?.reactions.good).toBe(1);
  });

  test('deleteMessages removes provided ids', () => {
    const store = createStore();
    const result = store.deleteMessages(['m-1002']);
    expect(result.ok).toBe(true);
    expect(store.getMessageById('m-1002')).toBeUndefined();
  });
});
