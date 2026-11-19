import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { AuthProvider } from './auth';
import { queryClient } from './queryClient';

const editor = { id: 1, email: 'ana@equipo.com', name: 'Ana', role: 'editor', active: true };
const catalog = { technologies: [{ name: 'React', kind: 'framework' }], providers: ['Firebase', 'AWS'] };
const savedProject = {
  id: 7, name: 'Nuevo', summary: 'x', status: 'activo', owner: 'Ana', repoUrl: null, productionUrl: null, docsUrl: null,
  archived: false, incidentCount: 0, updatedAt: '', stack: [], services: [], incidents: [],
};

type Reply = { status?: number; json: unknown };
type Handler = Reply | ((body: any, url: URL) => Reply);
let calls: Array<{ method: string; url: URL; body: any }> = [];

/** Simula la API: cada clave es "MÉTODO /ruta". Lo no definido responde 404. */
function mockApi(handlers: Record<string, Handler>) {
  calls = [];
  vi.stubGlobal('fetch', async (input: string, init: RequestInit = {}) => {
    const url = new URL(input, 'http://localhost');
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });
    const h = handlers[`${method} ${url.pathname}`];
    const reply = typeof h === 'function' ? h(body, url) : (h ?? { status: 404, json: { message: 'No encontrado' } });
    return new Response(JSON.stringify(reply.json), { status: reply.status ?? 200, headers: { 'Content-Type': 'application/json' } });
  });
}

function renderApp(path: string) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider><App /></AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const signedIn: Record<string, Handler> = {
  'GET /api/auth/me': { json: { user: editor } },
  'GET /api/catalog': { json: catalog },
  'GET /api/projects': { json: [] },
};

// jsdom no implementa <dialog>.showModal(); lo simulamos.
HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute('open'); };

// Radix (desplegables y paneles) usa APIs que jsdom no trae.
globalThis.ResizeObserver ??= class { observe() { } unobserve() { } disconnect() { } } as any;
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => { };
Element.prototype.releasePointerCapture ??= () => { };
Element.prototype.scrollIntoView ??= () => { };

beforeEach(() => {
  queryClient.clear();
  localStorage.clear();
  document.documentElement.classList.remove('dark'); // la marca es clara (papel) por defecto
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('login', () => {
  it('muestra los errores de cada campo sin llamar al servidor', async () => {
    mockApi({ 'GET /api/auth/me': { status: 401, json: { message: 'Debes iniciar sesión' } } });
    renderApp('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Indica un correo válido.')).toBeTruthy();
    expect(screen.getByText('La contraseña es obligatoria.')).toBeTruthy();
    expect(calls.some((c) => c.url.pathname === '/api/auth/login')).toBe(false);
  });
});

describe('formulario de proyecto', () => {
  it('valida los obligatorios, descarta filas vacías y envía el proyecto', async () => {
    mockApi({
      ...signedIn,
      'POST /api/projects': { status: 201, json: savedProject },
      'GET /api/projects/7': { json: savedProject },
      'GET /api/projects/7/history': { json: [] },
    });
    renderApp('/proyectos/nuevo');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Crear proyecto' }));

    expect(await screen.findByText('El nombre es obligatorio.')).toBeTruthy();
    expect(screen.getByText('El resumen es obligatorio.')).toBeTruthy();
    expect(screen.getByText('El responsable es obligatorio.')).toBeTruthy();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);

    await user.type(screen.getByLabelText('Nombre *'), 'Nuevo');
    await user.type(screen.getByLabelText('Resumen: de qué trata *'), 'Un resumen');
    await user.type(screen.getByLabelText('Responsable *'), 'Ana');
    await user.type(screen.getAllByLabelText('Tecnología')[0], 'React');
    await user.click(screen.getByRole('button', { name: 'Crear proyecto' }));

    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.body).toMatchObject({
      name: 'Nuevo',
      owner: 'Ana',
      stack: [{ name: 'React', kind: 'framework' }], // el tipo se completa solo desde el catálogo
      services: [], // la fila de servicio vacía se descartó
      incidents: [],
    });
    expect(await screen.findByRole('heading', { name: 'Nuevo' })).toBeTruthy();
  });

  it('muestra el error del servidor en la fila que el usuario ve, aunque haya filas vacías antes', async () => {
    mockApi({
      ...signedIn,
      'POST /api/projects': {
        status: 400,
        json: { message: 'Hay datos inválidos.', details: [{ field: 'services.0.provider', message: 'Proveedor no permitido.' }] },
      },
    });
    renderApp('/proyectos/nuevo');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Nombre *'), 'Nuevo');
    await user.type(screen.getByLabelText('Resumen: de qué trata *'), 'Un resumen');
    await user.type(screen.getByLabelText('Responsable *'), 'Ana');
    // Fila 1 de servicios queda vacía; la fila 2 se llena.
    await user.click(screen.getByRole('button', { name: '+ Añadir servicio' }));
    const names = screen.getAllByLabelText('Pieza');
    const providers = screen.getAllByLabelText('Proveedor');
    await user.type(names[1], 'API');
    await user.type(providers[1], 'Nube rara');
    await user.click(screen.getByRole('button', { name: 'Crear proyecto' }));

    const message = await screen.findByText('Proveedor no permitido.');
    expect(within(providers[1].closest('[data-field]') as HTMLElement).getByText('Proveedor no permitido.')).toBe(message);
  });

  it('exige proveedor cuando una fila de servicio tiene datos', async () => {
    mockApi(signedIn);
    renderApp('/proyectos/nuevo');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Nombre *'), 'Nuevo');
    await user.type(screen.getByLabelText('Resumen: de qué trata *'), 'Un resumen');
    await user.type(screen.getByLabelText('Responsable *'), 'Ana');
    await user.type(screen.getByLabelText('Pieza'), 'Sitio web');
    await user.click(screen.getByRole('button', { name: 'Crear proyecto' }));

    expect(await screen.findByText('Indica el proveedor (ej. Firebase).')).toBeTruthy();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });
});

describe('listado', () => {
  it('un clic en el proveedor Firebase filtra la consulta', async () => {
    mockApi(signedIn);
    renderApp('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Firebase' }));

    await waitFor(() =>
      expect(calls.some((c) => c.url.pathname === '/api/projects' && c.url.searchParams.get('provider') === 'Firebase')).toBe(true),
    );
  });

  it('un usuario de consulta no ve botones de edición', async () => {
    mockApi({ ...signedIn, 'GET /api/auth/me': { json: { user: { ...editor, role: 'lector' } } } });
    renderApp('/');
    await screen.findByRole('heading', { name: 'Proyectos' });
    expect(screen.queryByText('+ Nuevo proyecto')).toBeNull();
    expect(screen.queryByText('Usuarios')).toBeNull();
  });
});

describe('diseño', () => {
  it('Ctrl+K abre el buscador y permite filtrar por proveedor', async () => {
    mockApi(signedIn);
    renderApp('/');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Proyectos' });

    await user.keyboard('{Control>}k{/Control}');
    const box = await screen.findByRole('combobox', { name: 'Buscar' });
    await user.type(box, 'fire');
    const palette = within(await screen.findByRole('listbox'));
    await user.click(await palette.findByRole('option', { name: /Firebase/ }));

    await waitFor(() =>
      expect(calls.some((c) => c.url.pathname === '/api/projects' && c.url.searchParams.get('provider') === 'Firebase')).toBe(true),
    );
  });

  it('la pestaña Arquitectura ordena las piezas de frontend a datos', async () => {
    const service = (id: number, name: string, component: string, provider: string) => ({ id, name, component, provider, url: null, notes: null });
    mockApi({
      ...signedIn,
      'GET /api/projects/7': {
        json: {
          ...savedProject,
          services: [service(1, 'Base', 'base_de_datos', 'Google Cloud'), service(2, 'API', 'backend', 'AWS'), service(3, 'Web', 'frontend', 'Firebase')],
        },
      },
      'GET /api/projects/7/history': { json: [] },
    });
    renderApp('/proyectos/7');
    await userEvent.click(await screen.findByRole('tab', { name: 'Arquitectura' }));

    const boxes = await screen.findAllByRole('listitem');
    expect(boxes.map((b) => b.textContent)).toEqual([
      expect.stringContaining('Web'),
      expect.stringContaining('API'),
      expect.stringContaining('Base'),
    ]);
    expect(boxes[0].textContent).toContain('Firebase');
  });

  it('el modo claro/oscuro se puede cambiar y se recuerda (claro por defecto)', async () => {
    mockApi(signedIn);
    renderApp('/');
    const user = userEvent.setup();
    const toggles = await screen.findAllByRole('button', { name: 'Cambiar a modo oscuro' });
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    await user.click(toggles[0]);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('devbitacora-theme')).toBe('dark');
  });
});

describe('controles propios', () => {
  it('el selector de tecnología sugiere el catálogo, completa el tipo y ofrece crear una nueva', async () => {
    mockApi(signedIn);
    renderApp('/proyectos/nuevo');
    const user = userEvent.setup();
    const field = (await screen.findAllByLabelText('Tecnología'))[0];

    await user.type(field, 'Rea');
    await user.click(await screen.findByRole('option', { name: 'React' }));
    expect((field as HTMLInputElement).value).toBe('React');

    await user.clear(field);
    await user.type(field, 'Svelte');
    const create = await screen.findByRole('option', { name: /Svelte/ });
    expect(create.textContent).toContain('Nuevo');
    await user.click(create);
    expect((field as HTMLInputElement).value).toBe('Svelte');
  });

  it('el estado se elige con botones y viaja en el proyecto', async () => {
    mockApi({
      ...signedIn,
      'POST /api/projects': { status: 201, json: savedProject },
      'GET /api/projects/7': { json: savedProject },
      'GET /api/projects/7/history': { json: [] },
    });
    renderApp('/proyectos/nuevo');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Nombre *'), 'Nuevo');
    await user.type(screen.getByLabelText('Resumen: de qué trata *'), 'Un resumen');
    await user.type(screen.getByLabelText('Responsable *'), 'Ana');
    await user.click(screen.getByRole('radio', { name: 'Mantenimiento' }));
    await user.click(screen.getByRole('button', { name: 'Crear proyecto' }));

    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')!.body.status).toBe('mantenimiento');
  });

  it('el desplegable de estado del listado filtra la consulta', async () => {
    mockApi(signedIn);
    renderApp('/');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('combobox', { name: 'Estado' }));
    await user.click(await screen.findByRole('option', { name: 'Mantenimiento' }));

    await waitFor(() =>
      expect(calls.some((c) => c.url.pathname === '/api/projects' && c.url.searchParams.get('status') === 'mantenimiento')).toBe(true),
    );
  });
});
