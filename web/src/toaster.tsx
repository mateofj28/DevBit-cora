import { Toaster } from 'sonner';
import { useCurrentTheme } from './theme';

/** Notificaciones flotantes con los colores de la aplicación. */
export function ThemedToaster() {
  const theme = useCurrentTheme();
  return (
    <Toaster
      theme={theme}
      position="bottom-right"
      toastOptions={{
        style: { background: 'var(--c-surface)', color: 'var(--c-fg)', border: '1px solid var(--c-line)' },
      }}
    />
  );
}
