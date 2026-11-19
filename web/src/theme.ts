import { useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';
const KEY = 'devbitacora-theme';
const CHANGE_EVENT = 'devbitacora:theme';

export function getTheme(): Theme {
  return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'; // claro (papel) por defecto
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#14110f' : '#faf7f2');
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getTheme);
  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(KEY, theme);
    window.dispatchEvent(new Event(CHANGE_EVENT)); // avisa a otros componentes (p. ej. las notificaciones)
  }, [theme]);
  return { theme, toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) };
}

/** Sigue el tema actual sin tener que pasar props. */
export function useCurrentTheme(): Theme {
  const [theme, setTheme] = useState<Theme>(getTheme);
  useEffect(() => {
    const update = () => setTheme(getTheme());
    window.addEventListener(CHANGE_EVENT, update);
    return () => window.removeEventListener(CHANGE_EVENT, update);
  }, []);
  return theme;
}
