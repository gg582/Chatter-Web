type ThemeName = 'dark' | 'light';

type ThemeToggleRuntime = {
  dispose(): void;
};

const isThemeName = (value: string | null | undefined): value is ThemeName =>
  value === 'dark' || value === 'light';

const resolveInitialTheme = (
  root: HTMLElement,
  mediaQuery: MediaQueryList | null,
  documentElement: HTMLElement
): ThemeName => {
  if (isThemeName(root.dataset.theme)) {
    return root.dataset.theme;
  }
  if (isThemeName(documentElement.dataset.theme)) {
    return documentElement.dataset.theme;
  }
  if (mediaQuery && mediaQuery.matches) {
    return 'light';
  }
  return 'dark';
};

export const setupThemeToggle = (root: HTMLElement): ThemeToggleRuntime => {
  const documentElement = document.documentElement as HTMLElement;
  const prefersLightMediaQuery =
    typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: light)') : null;

  let currentTheme = resolveInitialTheme(root, prefersLightMediaQuery, documentElement);

  const applyTheme = (theme: ThemeName) => {
    if (theme === currentTheme) {
      return;
    }
    currentTheme = theme;
    documentElement.dataset.theme = theme;
    root.dataset.theme = theme;
    root.dispatchEvent(
      new CustomEvent('chatter:theme-change', {
        detail: { theme }
      })
    );
  };

  // Ensure the initial theme is applied to both the document and root nodes.
  documentElement.dataset.theme = currentTheme;
  root.dataset.theme = currentTheme;

  if (!prefersLightMediaQuery) {
    return {
      dispose: () => {}
    };
  }

  const handleSystemPreferenceChange = (event: MediaQueryListEvent) => {
    applyTheme(event.matches ? 'light' : 'dark');
  };

  prefersLightMediaQuery.addEventListener('change', handleSystemPreferenceChange);

  return {
    dispose: () => {
      prefersLightMediaQuery.removeEventListener('change', handleSystemPreferenceChange);
    }
  };
};
