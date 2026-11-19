import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, type Catalog, type HistoryEntry, type Project, type Role, type User } from './api';
import { invalidateData } from './queryClient';

export interface ProjectFilters {
  q: string;
  technology: string;
  provider: string;
  status: string;
  archived: boolean;
}

export const useCatalog = () =>
  useQuery({ queryKey: ['catalog'], queryFn: () => api<Catalog>('GET', '/api/catalog'), staleTime: 60_000 });

export const useProjects = (f: ProjectFilters, enabled = true) =>
  useQuery({
    enabled,
    queryKey: ['projects', f],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (f.q) qs.set('q', f.q);
      if (f.technology) qs.set('technology', f.technology);
      if (f.provider) qs.set('provider', f.provider);
      if (f.status) qs.set('status', f.status);
      if (f.archived) qs.set('archived', 'true');
      return api<Project[]>('GET', `/api/projects?${qs}`);
    },
    placeholderData: keepPreviousData, // la lista anterior sigue visible mientras llega la nueva
  });

export const useProject = (id: string | undefined, enabled = true) =>
  useQuery({ queryKey: ['project', id], queryFn: () => api<Project>('GET', `/api/projects/${id}`), enabled: enabled && !!id });

export const useHistory = (id: string | undefined) =>
  useQuery({ queryKey: ['history', id], queryFn: () => api<HistoryEntry[]>('GET', `/api/projects/${id}/history`), enabled: !!id });

export const useUsers = () => useQuery({ queryKey: ['users'], queryFn: () => api<User[]>('GET', '/api/users') });

/** Mutación genérica: ejecuta la llamada y luego refresca los datos afectados. */
export function useApiMutation<TVars, TResult = unknown>(fn: (vars: TVars) => Promise<TResult>, successMessage?: string | ((vars: TVars) => string)) {
  return useMutation({
    mutationFn: fn,
    onSuccess: (_data, vars) => {
      if (successMessage) toast.success(typeof successMessage === 'function' ? successMessage(vars) : successMessage);
      return invalidateData();
    },
  });
}

export const createUser = (body: { name: string; email: string; role: Role; password: string }) => api('POST', '/api/users', body);
export const updateUser = ({ id, ...change }: { id: number } & Partial<User> & { password?: string }) => api('PATCH', `/api/users/${id}`, change);
