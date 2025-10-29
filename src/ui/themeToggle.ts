type ThemeName = 'dark' | 'light';

type ThemeToggleRuntime = {
  dispose(): void;
};

const isThemeName = (value: string | null | undefined): value is ThemeName =>
  value === 'dark' || value === 'light';

const coerceThemePreference = (theme: ThemeName): ThemeName => (theme === 'light' ? 'dark' : theme);

const resolveInitialTheme = (
  root: HTMLElement,
  mediaQuery: MediaQueryList | null,
  documentElement: HTMLElement
): ThemeName => {
  if (isThemeName(root.dataset.theme)) {
    return coerceThemePreference(root.dataset.theme);
  }
  if (isThemeName(documentElement.dataset.theme)) {
    return coerceThemePreference(documentElement.dataset.theme);
  }
  if (mediaQuery && mediaQuery.matches) {
    return 'dark';
  }
  return 'dark';
};

export const setupThemeToggle = (root: HTMLElement): ThemeToggleRuntime => {
  const documentElement = document.documentElement as HTMLElement;
  const prefersLightMediaQuery =
    typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: light)') : null;

  let currentTheme = resolveInitialTheme(root, prefersLightMediaQuery, documentElement);

  const applyTheme = (theme: ThemeName) => {
    const coercedTheme = coerceThemePreference(theme);
    if (coercedTheme === currentTheme) {
      return;
    }
    currentTheme = coercedTheme;
    documentElement.dataset.theme = coercedTheme;
    root.dataset.theme = coercedTheme;
    root.dispatchEvent(
      new CustomEvent('chatter:theme-change', {
        detail: { theme: coercedTheme }
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
