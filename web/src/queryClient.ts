import { QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';

export const AUTH_EXPIRED_EVENT = 'devbitacora:auth-expired';

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    // Si el servidor responde 401 (sesión vencida o usuario desactivado), vuelve al login.
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      // No reintentar errores del servidor (4xx): solo fallos de red.
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400) && count < 2,
      refetchOnWindowFocus: false,
    },
  },
});

/** Refresca todo lo que depende de proyectos, incidentes y catálogo tras un cambio. */
export const invalidateData = () =>
  Promise.all(['projects', 'project', 'history', 'catalog', 'users'].map((k) => queryClient.invalidateQueries({ queryKey: [k] })));
