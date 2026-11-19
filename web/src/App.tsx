import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { CommandPalette } from './CommandPalette';
import { Icon } from './icons';
import { Logo } from './Logo';
import { cn } from './cn';
import LoginPage from './pages/Login';
import ProjectsPage from './pages/Projects';
import { useTheme } from './theme';
import { ErrorBoundary, Skeleton, btnPrimary } from './ui';

// Las pantallas menos frecuentes se descargan solo cuando se visitan.
const ProjectDetailPage = lazy(() => import('./pages/ProjectDetail'));
const ProjectFormPage = lazy(() => import('./pages/ProjectForm'));
const UsersPage = lazy(() => import('./pages/Users'));

function Brand() {
  return (
    <Link to="/" aria-label="DevBitácora, ir al inicio">
      <Logo />
    </Link>
  );
}

function Layout() {
  const { user, isEditor, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const side = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? 'bg-surface2 text-fg' : 'text-muted hover:bg-surface2 hover:text-fg'}`;
  const tab = ({ isActive }: { isActive: boolean }) =>
    `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium ${isActive ? 'text-accent' : 'text-muted'}`;
  const themeLabel = theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';

  return (
    <div className="min-h-screen md:pl-60">
      {/* Barra lateral (escritorio) */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-line bg-surface px-3 py-5 md:flex">
        <div className="px-2 pb-6"><Brand /></div>
        <nav aria-label="Principal" className="flex flex-col gap-1">
          <NavLink to="/" end className={side}><Icon name="grid" className="h-4 w-4" />Proyectos</NavLink>
          {isEditor && <NavLink to="/usuarios" className={side}><Icon name="users" className="h-4 w-4" />Usuarios</NavLink>}
        </nav>
        <div className="mt-auto space-y-1 border-t border-line pt-4">
          <div className="px-3 pb-2">
            <p className="truncate text-sm font-medium">{user?.name}</p>
            <p className="text-xs text-muted">{isEditor ? 'Editor' : 'Solo consulta'}</p>
          </div>
          <button onClick={toggle} className={`${side({ isActive: false })} w-full`}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} className="h-4 w-4" />{themeLabel}
          </button>
          <button onClick={logout} className={`${side({ isActive: false })} w-full`}><Icon name="logout" className="h-4 w-4" />Salir</button>
        </div>
      </aside>

      {/* Barra superior */}
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-bg/85 px-4 py-3 backdrop-blur md:px-8">
        <div className="md:hidden"><Brand /></div>
        <button
          onClick={() => setPaletteOpen(true)}
          aria-label="Abrir buscador"
          className="ml-auto flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-muted hover:bg-surface2 md:ml-0 md:w-full md:max-w-md"
        >
          <Icon name="search" className="h-4 w-4" />
          <span className="hidden flex-1 text-left md:block">Buscar proyectos, proveedores, errores…</span>
          <kbd className="hidden rounded border border-line px-1.5 text-xs md:block">Ctrl K</kbd>
        </button>
        <button onClick={toggle} aria-label={themeLabel} className="rounded-lg border border-line bg-surface p-2 text-muted hover:bg-surface2 md:hidden">
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} className="h-4 w-4" />
        </button>
        {isEditor && (
          <Link to="/proyectos/nuevo" className={cn(btnPrimary, 'hidden md:ml-auto md:inline-flex')}>
            <Icon name="plus" className="h-4 w-4" />Nuevo
          </Link>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-5 md:px-8 md:pb-10 md:pt-8">
        <ErrorBoundary>
          <Suspense fallback={<div className="space-y-3"><Skeleton className="h-8 w-1/3" /><Skeleton className="h-32" /></div>}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>

      {/* Navegación inferior (celular) */}
      <nav aria-label="Principal móvil" className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-surface md:hidden">
        <NavLink to="/" end className={tab}><Icon name="grid" />Proyectos</NavLink>
        {isEditor && <NavLink to="/proyectos/nuevo" className={tab}><Icon name="plus" />Nuevo</NavLink>}
        {isEditor && <NavLink to="/usuarios" className={tab}><Icon name="users" />Usuarios</NavLink>}
        <button onClick={logout} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium text-muted"><Icon name="logout" />Salir</button>
      </nav>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8"><Skeleton className="mx-auto h-10 w-48" /></div>;
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<ProjectsPage />} />
        <Route path="proyectos/nuevo" element={<ProjectFormPage />} />
        <Route path="proyectos/:id" element={<ProjectDetailPage />} />
        <Route path="proyectos/:id/editar" element={<ProjectFormPage />} />
        <Route path="usuarios" element={<UsersPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
