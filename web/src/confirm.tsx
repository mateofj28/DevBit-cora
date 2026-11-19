import { useCallback, useState, type ReactNode } from 'react';
import { ConfirmDialog } from './ui';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  /** Rojo para acciones que destruyen o descartan algo; neutro para el resto. */
  danger?: boolean;
}

/**
 * Modal de reconfirmación como promesa:
 *   const { ask, dialog } = useConfirm();
 *   if (await ask({ ... })) hacerLoQueSea();
 * Hay que renderizar `dialog` una vez en el componente.
 */
export function useConfirm(): { ask: (o: ConfirmOptions) => Promise<boolean>; dialog: ReactNode } {
  const [state, setState] = useState<{ opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);

  const ask = useCallback(
    (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ opts, resolve })),
    [],
  );

  const settle = (answer: boolean) => {
    state?.resolve(answer);
    setState(null);
  };

  const dialog = (
    <ConfirmDialog
      open={state !== null}
      title={state?.opts.title ?? ''}
      message={state?.opts.message ?? ''}
      confirmLabel={state?.opts.confirmLabel ?? 'Confirmar'}
      danger={state?.opts.danger ?? true}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  );

  return { ask, dialog };
}
