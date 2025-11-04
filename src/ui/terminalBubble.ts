const ANSI_PATTERN = /\u001b\[([0-9;]*)m/g;
const STRIP_PATTERN = /\u001b\[[0-9;]*[A-Za-z]/g;

const ANSI_16_COLOR_TABLE: [number, number, number][] = [
  [0, 0, 0],
  [205, 0, 0],
  [0, 205, 0],
  [205, 205, 0],
  [0, 0, 238],
  [205, 0, 205],
  [0, 205, 205],
  [229, 229, 229],
  [127, 127, 127],
  [255, 0, 0],
  [0, 255, 0],
  [255, 255, 0],
  [92, 92, 255],
  [255, 0, 255],
  [0, 255, 255],
  [255, 255, 255],
];

const COLOR_CUBE_STOPS = [0, 95, 135, 175, 215, 255] as const;

const clampColorComponent = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

const toRgbString = (r: number, g: number, b: number) => `rgb(${r}, ${g}, ${b})`;

const ansiIndexToRgb = (index: number): string | undefined => {
  if (!Number.isFinite(index)) {
    return undefined;
  }

  if (index >= 0 && index < ANSI_16_COLOR_TABLE.length) {
    const [r, g, b] = ANSI_16_COLOR_TABLE[index];
    return toRgbString(r, g, b);
  }

  if (index >= 16 && index <= 231) {
    const cubeIndex = index - 16;
    const r = COLOR_CUBE_STOPS[Math.floor(cubeIndex / 36) % 6];
    const g = COLOR_CUBE_STOPS[Math.floor(cubeIndex / 6) % 6];
    const b = COLOR_CUBE_STOPS[cubeIndex % 6];
    return toRgbString(r, g, b);
  }

  if (index >= 232 && index <= 255) {
    const level = 8 + (index - 232) * 10;
    const clamped = clampColorComponent(level);
    return toRgbString(clamped, clamped, clamped);
  }

  return undefined;
};

const parseExtendedColor = (
  codes: number[],
  position: number,
  target: 'foreground' | 'background',
  state: MutableSgrState
) => {
  const mode = codes[position + 1];
  if (typeof mode !== 'number') {
    return position;
  }

  if (mode === 5) {
    const value = codes[position + 2];
    const rgb = typeof value === 'number' ? ansiIndexToRgb(value) : undefined;
    if (rgb) {
      state[target] = rgb;
    }
    return position + 2;
  }

  if (mode === 2) {
    const rRaw = codes[position + 2];
    const gRaw = codes[position + 3];
    const bRaw = codes[position + 4];
    if ([rRaw, gRaw, bRaw].every((value) => typeof value === 'number')) {
      const r = clampColorComponent(rRaw);
      const g = clampColorComponent(gRaw);
      const b = clampColorComponent(bRaw);
      state[target] = toRgbString(r, g, b);
    }
    return position + 4;
  }

  return position;
};

const resetState = (state: MutableSgrState) => {
  delete state.foreground;
  delete state.background;
};

const applySgrCodes = (codes: number[], state: MutableSgrState) => {
  if (codes.length === 0) {
    resetState(state);
    return;
  }

  for (let index = 0; index < codes.length; index += 1) {
    const code = codes[index];
    switch (code) {
      case 0: {
        resetState(state);
        break;
      }
      case 39: {
        delete state.foreground;
        break;
      }
      case 49: {
        delete state.background;
        break;
      }
      case 38: {
        index = parseExtendedColor(codes, index, 'foreground', state);
        break;
      }
      case 48: {
        index = parseExtendedColor(codes, index, 'background', state);
        break;
      }
      default: {
        if (code >= 30 && code <= 37) {
          const rgb = ansiIndexToRgb(code - 30);
          if (rgb) {
            state.foreground = rgb;
          }
        } else if (code >= 90 && code <= 97) {
          const rgb = ansiIndexToRgb(code - 90 + 8);
          if (rgb) {
            state.foreground = rgb;
          }
        } else if (code >= 40 && code <= 47) {
          const rgb = ansiIndexToRgb(code - 40);
          if (rgb) {
            state.background = rgb;
          }
        } else if (code >= 100 && code <= 107) {
          const rgb = ansiIndexToRgb(code - 100 + 8);
          if (rgb) {
            state.background = rgb;
          }
        }
        break;
      }
    }
  }
};

type MutableSgrState = {
  foreground?: string;
  background?: string;
};

const parseAnsiStateAtFirstVisibleChar = (line: string): MutableSgrState => {
  const state: MutableSgrState = {};
  let cursor = 0;

  for (const match of line.matchAll(ANSI_PATTERN)) {
    const segment = line.slice(cursor, match.index ?? 0);
    for (const char of segment) {
      if (char === '\r' || char === '\n') {
        continue;
      }
      if (char.trim() === '') {
        continue;
      }
      return { ...state };
    }

    const rawCodes = (match[1] ?? '')
      .split(';')
      .filter((code) => code.length > 0)
      .map((code) => Number.parseInt(code, 10))
      .filter((code) => Number.isFinite(code));

    applySgrCodes(rawCodes, state);
    cursor = (match.index ?? 0) + match[0].length;
  }

  const remainder = line.slice(cursor);
  for (const char of remainder) {
    if (char === '\r' || char === '\n') {
      continue;
    }
    if (char.trim() === '') {
      continue;
    }
    return { ...state };
  }

  return { ...state };
};

const stripAnsi = (value: string) => value.replace(STRIP_PATTERN, '');

const normaliseBubbleLine = (line: string) => stripAnsi(line).replace(/\r$/u, '');

const BUBBLE_START = '╭';
const BUBBLE_END = '╰';
const BUBBLE_RIGHT = '╮';
const BUBBLE_RIGHT_END = '╯';

export const isBubbleStartLine = (line: string) => {
  const trimmed = normaliseBubbleLine(line).trimStart();
  return trimmed.startsWith(BUBBLE_START) && trimmed.includes(BUBBLE_RIGHT);
};

export const isBubbleEndLine = (line: string) => {
  const trimmed = normaliseBubbleLine(line).trimStart();
  return trimmed.startsWith(BUBBLE_END) && trimmed.includes(BUBBLE_RIGHT_END);
};

export type TerminalBubblePalette = {
  borderColor?: string;
  backgroundColor?: string;
};

export type TerminalBubble = {
  author: string;
  content: string;
  palette: TerminalBubblePalette;
};

const extractPalette = (lines: string[]): TerminalBubblePalette => {
  for (const line of lines) {
    const state = parseAnsiStateAtFirstVisibleChar(line);
    if (state.foreground || state.background) {
      return {
        borderColor: state.foreground,
        backgroundColor: state.background,
      };
    }
  }
  return {};
};

export const parseTerminalBubble = (lines: string[]): TerminalBubble | null => {
  if (lines.length < 3) {
    return null;
  }

  const normalisedLines = lines.map(normaliseBubbleLine);
  const topBorder = normalisedLines[0]?.trimEnd();
  const bottomBorder = normalisedLines[normalisedLines.length - 1]?.trimEnd();

  if (!topBorder || !bottomBorder) {
    return null;
  }

  const topBorderStart = topBorder.trimStart();
  const bottomBorderStart = bottomBorder.trimStart();

  if (
    !topBorderStart.startsWith(BUBBLE_START) ||
    !topBorderStart.includes(BUBBLE_RIGHT) ||
    !bottomBorderStart.startsWith(BUBBLE_END) ||
    !bottomBorderStart.includes(BUBBLE_RIGHT_END)
  ) {
    return null;
  }

  const contentLines = normalisedLines.slice(1, -1).map((line) => {
    const leftPipe = line.indexOf('│');
    const rightPipe = line.lastIndexOf('│');

    if (leftPipe === -1 || rightPipe === -1 || leftPipe === rightPipe) {
      return line.trimEnd();
    }

    const inner = line.slice(leftPipe + 1, rightPipe);
    return inner.replace(/\s+$/u, '');
  });

  while (contentLines.length && contentLines[0].trim() === '') {
    contentLines.shift();
  }
  while (contentLines.length && contentLines[contentLines.length - 1]?.trim() === '') {
    contentLines.pop();
  }

  const palette = extractPalette(lines);

  if (contentLines.length === 0) {
    return { author: '', content: '', palette };
  }

  let author = '';
  const firstLine = contentLines[0] ?? '';
  const authorMatch = firstLine.match(/^\s*\[([^\]]+)\]\s*/u);
  if (authorMatch) {
    author = authorMatch[1].trim();
    contentLines[0] = firstLine.slice(authorMatch[0].length);
  }

  const content = contentLines
    .map((line) => line.replace(/^\s+/u, '').trimEnd())
    .join('\n')
    .trimEnd();

  return {
    author,
    content,
    palette,
  };
};

export const stripAnsiCodes = stripAnsi;
export const normaliseBubbleLineContent = normaliseBubbleLine;
