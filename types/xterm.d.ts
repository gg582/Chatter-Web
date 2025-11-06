declare module '/lib/xterm.js' {
  export class Terminal {
    constructor(options?: {
      rows?: number;
      cols?: number;
      cursorBlink?: boolean;
      cursorStyle?: 'block' | 'underline' | 'bar';
      scrollback?: number;
      theme?: {
        background?: string;
        foreground?: string;
        cursor?: string;
        cursorAccent?: string;
        selection?: string;
        black?: string;
        red?: string;
        green?: string;
        yellow?: string;
        blue?: string;
        magenta?: string;
        cyan?: string;
        white?: string;
        brightBlack?: string;
        brightRed?: string;
        brightGreen?: string;
        brightYellow?: string;
        brightBlue?: string;
        brightMagenta?: string;
        brightCyan?: string;
        brightWhite?: string;
      };
      fontFamily?: string;
      fontSize?: number;
      fontWeight?: string | number;
      fontWeightBold?: string | number;
      lineHeight?: number;
      allowTransparency?: boolean;
      convertEol?: boolean;
      disableStdin?: boolean;
    });

    open(container: HTMLElement): void;
    write(data: string | Uint8Array): void;
    writeln(data: string): void;
    clear(): void;
    reset(): void;
    dispose(): void;
    focus(): void;
    blur(): void;
    scrollToBottom(): void;
    scrollToTop(): void;
    scrollLines(amount: number): void;
    scrollPages(pageCount: number): void;
    scrollToLine(line: number): void;
    onData(callback: (data: string) => void): { dispose(): void };
    onResize(callback: (size: { cols: number; rows: number }) => void): { dispose(): void };
    onKey(callback: (event: { key: string; domEvent: KeyboardEvent }) => void): { dispose(): void };
    onBinary(callback: (data: string) => void): { dispose(): void };
    onCursorMove(callback: () => void): { dispose(): void };
    onLineFeed(callback: () => void): { dispose(): void };
    onScroll(callback: (ydisp: number) => void): { dispose(): void };
    onSelectionChange(callback: () => void): { dispose(): void };
    onRender(callback: (event: { start: number; end: number }) => void): { dispose(): void };
    onTitleChange(callback: (title: string) => void): { dispose(): void };
    
    loadAddon(addon: unknown): void;
    
    readonly cols: number;
    readonly rows: number;
    readonly buffer: {
      active: {
        cursorX: number;
        cursorY: number;
        viewportY: number;
        baseY: number;
        length: number;
        getLine(y: number): {
          translateToString(trimRight?: boolean, startColumn?: number, endColumn?: number): string;
        } | undefined;
      };
    };
    readonly element: HTMLElement | undefined;
    readonly textarea: HTMLTextAreaElement | undefined;
  }
}

declare module '/lib/addon-fit.js' {
  export class FitAddon {
    constructor();
    fit(): void;
    proposeDimensions(): { cols: number; rows: number } | undefined;
    activate(terminal: unknown): void;
    dispose(): void;
  }
}
