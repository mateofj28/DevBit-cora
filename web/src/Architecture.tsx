import { useLayoutEffect, useRef, useState } from 'react';
import { COMPONENT_LABEL, type Component, type Project, type Service } from './api';
import { cn } from './cn';
import { EmptyState, providerTone } from './ui';

// ---------- Figuras ----------
// Cada tipo de pieza tiene su dibujo: pantalla (frontend), servidor (backend), cilindro (base de datos),
// caja (almacenamiento), nube (otros) y persona (usuarios). Se pintan con el color del proveedor.

type Shape = Component | 'user';

function Figure({ shape, className = 'h-14 w-14' }: { shape: Shape; className?: string }) {
  const common = { fill: 'currentColor', fillOpacity: 0.12, stroke: 'currentColor', strokeWidth: 2, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden>
      {shape === 'frontend' && (
        <>
          <rect x="6" y="9" width="52" height="35" rx="5" {...common} />
          <path d="M6 20h52" stroke="currentColor" strokeWidth="2" />
          <circle cx="12" cy="14.5" r="1.4" fill="currentColor" />
          <circle cx="17.5" cy="14.5" r="1.4" fill="currentColor" />
          <circle cx="23" cy="14.5" r="1.4" fill="currentColor" />
          <path d="M14 28h22M14 34h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M32 44v9M22 54h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
      {shape === 'backend' && (
        <>
          {[8, 25, 42].map((y) => (
            <g key={y}>
              <rect x="8" y={y} width="48" height="14" rx="3.5" {...common} />
              <circle cx="17" cy={y + 7} r="2" fill="currentColor" />
              <path d={`M26 ${y + 7}h20`} stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </g>
          ))}
        </>
      )}
      {shape === 'base_de_datos' && (
        <>
          <path d="M12 14v34c0 4.4 9 8 20 8s20-3.6 20-8V14" {...common} />
          <ellipse cx="32" cy="14" rx="20" ry="8" {...common} fillOpacity={0.25} />
          <path d="M12 26c0 4.4 9 8 20 8s20-3.6 20-8M12 37c0 4.4 9 8 20 8s20-3.6 20-8" stroke="currentColor" strokeWidth="2" />
        </>
      )}
      {shape === 'almacenamiento' && (
        <>
          <path d="M10 22 32 11l22 11v21L32 54 10 43z" {...common} />
          <path d="M10 22l22 11 22-11M32 33v21" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </>
      )}
      {shape === 'otro' && (
        <path d="M19 47h28a10.5 10.5 0 0 0 1.4-20.9A14.5 14.5 0 0 0 20.6 25 11 11 0 0 0 19 47z" {...common} />
      )}
      {shape === 'user' && (
        <>
          <circle cx="32" cy="22" r="9" {...common} />
          <path d="M13 54c0-10.5 8.5-17 19-17s19 6.5 19 17" {...common} />
        </>
      )}
    </svg>
  );
}

// ---------- Estructura del diagrama ----------

const tierOf = (c: Component) => (c === 'frontend' ? 0 : c === 'backend' ? 1 : 2);
const TIER_TITLES = ['Interfaz', 'Servidor / API', 'Datos y servicios'];

function buildTiers(services: Service[]) {
  const withId = services.map((s, i) => ({ ...s, key: `s${s.id ?? i}` }));
  return [0, 1, 2]
    .map((t) => ({ title: TIER_TITLES[t], nodes: withId.filter((s) => tierOf(s.component) === t) }))
    .filter((t) => t.nodes.length > 0);
}

interface Box { left: number; right: number; top: number; bottom: number }
interface Geometry { w: number; h: number; base: string[]; flow: string[]; arrows: string[] }

/**
 * Conecta un grupo de cajas con el siguiente con un "bus": cada origen sale hacia una línea común y de ahí
 * baja a cada destino (ángulos rectos, sin cruces). En vertical solo cuentan la última fila de origen
 * y la primera fila de destino, porque los grupos largos se parten en varias filas.
 */
function connectGroups(src: Box[], dst: Box[], vertical: boolean) {
  const base: string[] = [];
  const flow: string[] = [];
  const arrows: string[] = [];
  const GAP = 4; // separación de la punta de flecha respecto de la caja

  if (!vertical) {
    const mid = (r: Box) => (r.top + r.bottom) / 2;
    const busX = (Math.max(...src.map((r) => r.right)) + Math.min(...dst.map((r) => r.left))) / 2;
    const ys = [...src.map(mid), ...dst.map(mid)];
    base.push(`M${busX} ${Math.min(...ys)}V${Math.max(...ys)}`);
    src.forEach((r) => flow.push(`M${r.right} ${mid(r)}H${busX}`));
    dst.forEach((r) => arrows.push(`M${busX} ${mid(r)}H${r.left - GAP}`));
  } else {
    const mid = (r: Box) => (r.left + r.right) / 2;
    const lastBottom = Math.max(...src.map((r) => r.bottom));
    const firstTop = Math.min(...dst.map((r) => r.top));
    const from = src.filter((r) => lastBottom - r.bottom < 4);
    const to = dst.filter((r) => r.top - firstTop < 4);
    const busY = (lastBottom + firstTop) / 2;
    const xs = [...from.map(mid), ...to.map(mid)];
    base.push(`M${Math.min(...xs)} ${busY}H${Math.max(...xs)}`);
    from.forEach((r) => flow.push(`M${mid(r)} ${r.bottom}V${busY}`));
    to.forEach((r) => arrows.push(`M${mid(r)} ${busY}V${r.top - GAP}`));
  }
  return { base, flow, arrows };
}
export function Architecture({ project }: { project: Project }) {
  const tiers = buildTiers(project.services);

  const wrapRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  // En espacios angostos (celular, o escritorio con el panel lateral) el diagrama se apila de arriba hacia abajo.
  const [vertical, setVertical] = useState(true);
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const update = () => setVertical(wrap.clientWidth < 680);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);
  const nodeRefs = useRef(new Map<string, HTMLElement>());
  const [geo, setGeo] = useState<Geometry>({ w: 0, h: 0, base: [], flow: [], arrows: [] });

  const register = (key: string) => (el: HTMLElement | null) => {
    if (el) nodeRefs.current.set(key, el);
    else nodeRefs.current.delete(key);
  };

  // Mide las cajas y traza los conectores. Se recalcula al cambiar el tamaño o la orientación.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const groups = [['user'], ...tiers.map((tier) => tier.nodes.map((n) => n.key))];
    const measure = () => {
      const origin = box.getBoundingClientRect();
      const rectOf = (key: string) => {
        const r = nodeRefs.current.get(key)?.getBoundingClientRect();
        return r ? { left: r.left - origin.left, right: r.right - origin.left, top: r.top - origin.top, bottom: r.bottom - origin.top } : null;
      };
      const next: Geometry = {
        // offsetWidth/offsetHeight no incluyen al propio SVG, así que el tamaño no se retroalimenta.
        w: box.offsetWidth, h: box.offsetHeight, base: [], flow: [], arrows: [],
      };
      for (let i = 0; i < groups.length - 1; i++) {
        const src = groups[i].map(rectOf).filter((r): r is NonNullable<typeof r> => !!r);
        const dst = groups[i + 1].map(rectOf).filter((r): r is NonNullable<typeof r> => !!r);
        if (!src.length || !dst.length) continue;
        const seg = connectGroups(src, dst, vertical);
        next.base.push(...seg.base);
        next.flow.push(...seg.flow);
        next.arrows.push(...seg.arrows);
      }
      setGeo((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.services, vertical]);

  if (project.services.length === 0) {
    return <EmptyState title="Sin servicios registrados" text="Edita el proyecto para indicar qué pieza vive en qué proveedor." />;
  }

  const providers = [...new Set(project.services.map((s) => s.provider))];

  return (
    <div className="space-y-4">
      <div ref={wrapRef} className="overflow-x-auto rounded-xl border border-line bg-surface2">
        <div ref={boxRef} className={cn('relative p-5 md:p-7', vertical ? 'w-full' : 'w-max min-w-full')} role="group" aria-label="Diagrama de arquitectura">
          {/* Líneas de conexión: van debajo de las cajas */}
          <svg className="pointer-events-none absolute left-0 top-0 text-muted" width={geo.w} height={geo.h} aria-hidden>
            <defs>
              <marker id="arch-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M0 0 10 5 0 10z" fill="currentColor" />
              </marker>
            </defs>
            {[...geo.base, ...geo.flow].map((d, i) => (
              <path key={`b${i}`} d={d} stroke="currentColor" strokeOpacity="0.35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            ))}
            {geo.arrows.map((d, i) => (
              <path key={`a${i}`} d={d} stroke="currentColor" strokeOpacity="0.35" strokeWidth="2" strokeLinecap="round" fill="none" markerEnd="url(#arch-arrow)" />
            ))}
            {[...geo.flow, ...geo.arrows].map((d, i) => (
              <path key={`f${i}`} d={d} className="arch-flow" stroke="var(--c-accent)" strokeWidth="2" fill="none" />
            ))}
          </svg>

          <div
            role="list"
            aria-label="Arquitectura del proyecto"
            className={cn('relative flex items-center', vertical ? 'flex-col gap-14' : 'flex-row justify-center gap-8')}
          >
            {/* Personas usuarias: origen del flujo (decorativo) */}
            <div ref={register('user')} aria-hidden className="flex w-20 shrink-0 flex-col items-center gap-1 text-muted">
              <Figure shape="user" className="h-12 w-12" />
              <span className="text-xs font-medium">Usuarios</span>
            </div>

            {tiers.map((tier) => (
              <div key={tier.title} className={cn('flex flex-col gap-3', vertical ? 'w-full items-stretch' : 'items-center gap-4')}>
                {/* En vertical el título de nivel chocaría con las líneas; ahí basta la etiqueta de cada caja. */}
                {!vertical && <p aria-hidden className="text-[11px] font-semibold uppercase tracking-wider text-muted">{tier.title}</p>}
                <div className={cn(vertical ? 'flex flex-wrap justify-center gap-4' : 'flex flex-col items-center gap-5')}>
                {tier.nodes.map((s) => {
                  const tone = providerTone(s.provider);
                  return (
                    <div
                      key={s.key}
                      ref={register(s.key)}
                      role="listitem"
                      className="w-[8.75rem] shrink-0 rounded-2xl border border-line bg-surface p-3 text-center shadow-sm"
                    >
                      <div className={cn('mx-auto grid h-[4.5rem] w-full place-items-center rounded-xl border-2 border-dashed', tone.border, tone.text)}>
                        <Figure shape={s.component} />
                      </div>
                      <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-muted">{COMPONENT_LABEL[s.component]}</p>
                      <p className="break-words text-sm font-semibold leading-tight">{s.name}</p>
                      <p className={cn('mt-1 text-xs font-medium', tone.text)}>{s.provider}</p>
                      {s.url && (
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="mt-1 block truncate text-[11px] text-accent hover:underline" title={s.url}>
                          {s.url.replace(/^https?:\/\//, '')}
                        </a>
                      )}
                      {s.notes && <p className="mt-1 text-[11px] leading-snug text-muted">{s.notes}</p>}
                    </div>
                  );
                })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="text-xs text-muted">Proveedores: {providers.join(', ')}</p>
    </div>
  );
}
