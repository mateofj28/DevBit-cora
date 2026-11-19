import { Toaster } from 'sonner';
import { useCurrentTheme } from './theme';

/** Notificaciones flotantes con los colores de la aplicación. */
export function ThemedToaster() {
  const theme = useCurrentTheme();
  return (
    <Toaster
      theme={theme}
      position="bottom-right"
          // En celular suben para no quedar tapadas por la barra inferior flotante.
          mobileOffset={{ bottom: '6.5rem' }}
      toastOptions={{
        style: { background: 'var(--c-surface)', color: 'var(--c-fg)', border: '1px solid var(--c-line)' },
      }}
    />
  );
}
