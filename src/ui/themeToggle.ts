const THEME_STORAGE_KEY = 'chatter-theme';

type ThemeName = 'dark' | 'light';

type ThemeToggleRuntime = {
  dispose(): void;
};

const isThemeName = (value: string | null | undefined): value is ThemeName =>
  value === 'dark' || value === 'light';

const getStoredTheme = (): ThemeName | null => {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeName(value) ? value : null;
  } catch {
    return null;
  }
};

const setStoredTheme = (theme: ThemeName) => {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage errors.
  }
};

const removeStoredTheme = () => {
  try {
    localStorage.removeItem(THEME_STORAGE_KEY);
  } catch {
    // Ignore storage errors.
  }
};

export const setupThemeToggle = (root: HTMLElement): ThemeToggleRuntime => {
  const button = root.querySelector<HTMLButtonElement>('[data-action="toggle-theme"]');
  if (!button) {
    return {
      dispose: () => {},
    };
  }

  const prefersLightMediaQuery = window.matchMedia('(prefers-color-scheme: light)');
  const getPreferredTheme = (): ThemeName => (prefersLightMediaQuery.matches ? 'light' : 'dark');

  let current: ThemeName = 'dark';
  let hasExplicitChoice = false;

  const applyTheme = (theme: ThemeName, options: { persist?: boolean } = {}) => {
    const { persist = false } = options;
    if (persist) {
      hasExplicitChoice = true;
      setStoredTheme(theme);
    }
    current = theme;
    document.documentElement.dataset.theme = theme;
    root.dataset.theme = theme;

    if (button) {
      const nextLabel = theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode';
      const nextIcon = theme === 'light' ? '🌙' : '☀️';
      button.setAttribute('aria-label', nextLabel);
      button.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
      button.dataset.themeState = theme;
      button.textContent = nextIcon;
      button.title = nextLabel;
    }
  };

  const storedTheme = getStoredTheme();
  if (storedTheme) {
    hasExplicitChoice = true;
    applyTheme(storedTheme);
  } else {
    applyTheme(getPreferredTheme());
  }

  const handleToggleClick = () => {
    const nextTheme: ThemeName = current === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme, { persist: true });
  };

  button.addEventListener('click', handleToggleClick);

  const handleSystemPreferenceChange = (event: MediaQueryListEvent) => {
    if (hasExplicitChoice) {
      return;
    }
    applyTheme(event.matches ? 'light' : 'dark');
  };

  prefersLightMediaQuery.addEventListener('change', handleSystemPreferenceChange);

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) {
      return;
    }

    if (event.newValue === null) {
      hasExplicitChoice = false;
      removeStoredTheme();
      applyTheme(getPreferredTheme());
      return;
    }

    if (!isThemeName(event.newValue)) {
      return;
    }

    hasExplicitChoice = true;
    applyTheme(event.newValue);
  };

  window.addEventListener('storage', handleStorage);

  return {
    dispose: () => {
      button.removeEventListener('click', handleToggleClick);
      prefersLightMediaQuery.removeEventListener('change', handleSystemPreferenceChange);
      window.removeEventListener('storage', handleStorage);
    },
  };
};
