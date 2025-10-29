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
  const themeButtons = Array.from(
    root.querySelectorAll<HTMLButtonElement>('[data-action="set-theme"]')
  )
    .map((button) => {
      const theme = button.dataset.theme ?? null;
      if (!isThemeName(theme)) {
        return null;
      }
      return { button, theme } as const;
    })
    .filter((entry): entry is { button: HTMLButtonElement; theme: ThemeName } => entry !== null);

  if (themeButtons.length === 0) {
    return {
      dispose: () => {},
    };
  }

  const prefersLightMediaQuery = window.matchMedia('(prefers-color-scheme: light)');
  const getPreferredTheme = (): ThemeName => (prefersLightMediaQuery.matches ? 'light' : 'dark');

  let hasExplicitChoice = false;

  const updateButtonStates = (theme: ThemeName) => {
    themeButtons.forEach(({ button, theme: buttonTheme }) => {
      const isActive = buttonTheme === theme;
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      button.classList.toggle('is-active', isActive);
      const baseLabel = buttonTheme === 'light' ? 'Use light mode' : 'Use dark mode';
      const statusLabel = buttonTheme === 'light' ? 'Light mode' : 'Dark mode';
      button.setAttribute('aria-label', isActive ? `${statusLabel} (active)` : baseLabel);
      button.title = baseLabel;
    });
  };

  const applyTheme = (theme: ThemeName, options: { persist?: boolean } = {}) => {
    const { persist = false } = options;
    if (persist) {
      hasExplicitChoice = true;
      setStoredTheme(theme);
    }
    document.documentElement.dataset.theme = theme;
    root.dataset.theme = theme;

    updateButtonStates(theme);

    root.dispatchEvent(
      new CustomEvent('chatter:theme-change', {
        detail: { theme }
      })
    );
  };

  const storedTheme = getStoredTheme();
  if (storedTheme) {
    hasExplicitChoice = true;
    applyTheme(storedTheme);
  } else {
    applyTheme(getPreferredTheme());
  }

  const handleThemeButtonClick = (event: Event) => {
    const target = event.currentTarget as HTMLButtonElement | null;
    if (!target) {
      return;
    }
    const entry = themeButtons.find((item) => item.button === target);
    if (!entry) {
      return;
    }
    applyTheme(entry.theme, { persist: true });
  };

  themeButtons.forEach(({ button }) => {
    button.addEventListener('click', handleThemeButtonClick);
  });

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
      themeButtons.forEach(({ button }) => {
        button.removeEventListener('click', handleThemeButtonClick);
      });
      prefersLightMediaQuery.removeEventListener('change', handleSystemPreferenceChange);
      window.removeEventListener('storage', handleStorage);
    },
  };
};
