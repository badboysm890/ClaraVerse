import { useEffect, useState } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';

export const useTheme = (initialPreference: ThemePreference = 'system') => {
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => {
    return (localStorage.getItem('theme') as ThemePreference) || initialPreference;
  });

  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const html = document.documentElement;

    const applyTheme = (mode: 'light' | 'dark') => {
      html.classList.toggle('dark', mode === 'dark');
      localStorage.setItem('theme', themePreference);
      setResolvedTheme(mode);
    };

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemChange = (e: MediaQueryListEvent) => {
      if (themePreference === 'system') {
        applyTheme(e.matches ? 'dark' : 'light');
      }
    };

    if (themePreference === 'system') {
      applyTheme(mediaQuery.matches ? 'dark' : 'light');
      mediaQuery.addEventListener('change', handleSystemChange);
      return () => mediaQuery.removeEventListener('change', handleSystemChange);
    }

    applyTheme(themePreference);
  }, [themePreference]);

  const toggleTheme = () => {
    setThemePreference((prev) =>
      prev === 'light' ? 'dark' : prev === 'dark' ? 'light' : 'dark'
    );
  };

  return {
    themePreference,
    resolvedTheme,
    isDark: resolvedTheme === 'dark',
    setThemePreference,
    toggleTheme,
  };
};
