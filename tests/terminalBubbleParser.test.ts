import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isBubbleEndLine, isBubbleStartLine, parseTerminalBubble } from '../src/ui/terminalBubble.js';

describe('terminal bubble parser', () => {
  it('detects bubble borders with ansi sequences and padding', () => {
    const startLine = '   \u001b[34m╭────╮\u001b[0m';
    const endLine = '\u001b[34m╰────╯\u001b[0m   ';
    assert.equal(isBubbleStartLine(startLine), true);
    assert.equal(isBubbleEndLine(endLine), true);
  });

  it('parses author, content, and 16-color border tones', () => {
    const lines = [
      '\u001b[31m╭────────╮\u001b[0m',
      '\u001b[31m│ [Alice] 안녕하세요! │\u001b[0m',
      '\u001b[31m╰────────╯\u001b[0m',
    ];

    const bubble = parseTerminalBubble(lines);
    assert.ok(bubble);
    assert.equal(bubble?.author, 'Alice');
    assert.equal(bubble?.content, '안녕하세요!');
    assert.equal(bubble?.palette.borderColor, 'rgb(205, 0, 0)');
    assert.equal(bubble?.palette.backgroundColor, undefined);
  });

  it('parses multiline bubbles with 24-bit background colours and unicode text', () => {
    const lines = [
      '\u001b[38;2;230;240;255m\u001b[48;2;30;64;90m╭───────────────╮\u001b[0m',
      '\u001b[48;2;30;64;90m│ [봇] 상태 OK │\u001b[0m',
      '\u001b[48;2;30;64;90m│ 다음 점검은 09:30 예정 │\u001b[0m',
      '\u001b[48;2;30;64;90m╰───────────────╯\u001b[0m',
    ];

    const bubble = parseTerminalBubble(lines);
    assert.ok(bubble);
    assert.equal(bubble?.author, '봇');
    assert.equal(bubble?.content, '상태 OK\n다음 점검은 09:30 예정');
    assert.equal(bubble?.palette.borderColor, 'rgb(230, 240, 255)');
    assert.equal(bubble?.palette.backgroundColor, 'rgb(30, 64, 90)');
  });
});
