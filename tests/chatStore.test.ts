import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ChatStore } from '../src/state/chatStore.js';
import { seedState } from '../src/state/seed.js';

const createStore = () => new ChatStore(seedState);

describe('ChatStore messaging helpers', () => {
  it('getMessageById returns seeded message', () => {
    const store = createStore();
    const message = store.getMessageById('m-1001');
    assert.equal(message?.author, 'admin');
  });

  it('reactToMessage increments reaction counts', () => {
    const store = createStore();
    const result = store.reactToMessage('m-1001', 'good');
    assert.equal(result.ok, true);
    const message = store.getMessageById('m-1001');
    assert.equal(message?.reactions.good, 1);
  });

  it('deleteMessages removes provided ids', () => {
    const store = createStore();
    const result = store.deleteMessages(['m-1002']);
    assert.equal(result.ok, true);
    assert.equal(store.getMessageById('m-1002'), undefined);
  });
});
