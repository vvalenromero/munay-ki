// Sincronización con Supabase: replica localStorage en la nube.
// Estrategia "local-first": la app nunca espera a internet — lee y
// escribe local, y este módulo sube los cambios propios y baja los
// ajenos cada 30 segundos (y apenas vuelve la conexión).

import { snapshot, replaceAll, setChangeListener } from './storage.js';

const SUPABASE_URL = 'https://mqecxwalarljrjhyphnj.supabase.co';
const SUPABASE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xZWN4d2FsYXJsanJqaHlwaG5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MzgwNzQsImV4cCI6MjEwMDUxNDA3NH0.GirVky77BQohn7nSiXlGVcN43ccKR4Lhq8kHVIcYzp4';
const POLL_MS = 30_000;
const K_PENDING_DELETES = 'munayki:pending-deletes';
const K_DIRTY = 'munayki:dirty';

const HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

let lastSyncAt = null;
let online = false;
let busy = false;

export function syncStatus() {
  return { online, lastSyncAt };
}

// ---- cola de pendientes (sobrevive aunque cierren la app) ----
function pendingDeletes() {
  try {
    return JSON.parse(localStorage.getItem(K_PENDING_DELETES)) || [];
  } catch {
    return [];
  }
}
function setPendingDeletes(ids) {
  localStorage.setItem(K_PENDING_DELETES, JSON.stringify(ids));
}
function isDirty() {
  return localStorage.getItem(K_DIRTY) === '1';
}
function setDirty(v) {
  if (v) localStorage.setItem(K_DIRTY, '1');
  else localStorage.removeItem(K_DIRTY);
}

// ---- HTTP contra la API REST de Supabase (PostgREST) ----
async function req(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: HEADERS, ...options });
  if (!res.ok) throw new Error('Supabase respondió ' + res.status);
  return res.status === 204 ? null : res.json();
}

// ---- mapeos entre el formato de la app y el de las tablas ----
function rowToReserva(row) {
  return {
    id: row.id,
    cabinId: row.cabin_id,
    checkIn: row.check_in,
    checkOut: row.check_out,
    huesped: { nombre: row.nombre, telefono: row.telefono },
    precioNoche: Number(row.precio_noche) || 0,
    total: Number(row.total) || 0,
    senia: Number(row.senia) || 0,
    estado: row.estado,
    notas: row.notas || '',
    createdAt: row.created_at,
  };
}

function reservaToRow(r) {
  return {
    id: r.id,
    cabin_id: r.cabinId,
    check_in: r.checkIn,
    check_out: r.checkOut,
    nombre: r.huesped.nombre,
    telefono: r.huesped.telefono,
    precio_noche: r.precioNoche,
    total: r.total,
    senia: r.senia,
    estado: r.estado,
    notas: r.notas || '',
  };
}

// ---- subir cambios a la nube ----
const UPSERT = { ...HEADERS, Prefer: 'resolution=merge-duplicates' };

async function pushChange(kind, payload) {
  if (kind === 'reserva-upsert') {
    await req('reservas', { method: 'POST', headers: UPSERT, body: JSON.stringify(reservaToRow(payload)) });
  } else if (kind === 'reserva-delete') {
    await req(`reservas?id=eq.${encodeURIComponent(payload)}`, { method: 'DELETE' });
  } else if (kind === 'cabins') {
    const rows = payload.map((c, i) => ({ id: c.id, nombre: c.nombre, capacidad: c.capacidad, orden: i + 1 }));
    await req('cabins', { method: 'POST', headers: UPSERT, body: JSON.stringify(rows) });
  } else if (kind === 'config') {
    await req('config', {
      method: 'POST',
      headers: UPSERT,
      body: JSON.stringify({ id: 1, precios: payload.precioNoche }),
    });
  }
}

// Cada escritura local intenta subirse al instante; si no hay conexión,
// queda marcada para reintentar en el próximo ciclo.
function onLocalChange(kind, payload) {
  pushChange(kind, payload).catch(() => {
    if (kind === 'reserva-delete') {
      const ids = pendingDeletes();
      if (!ids.includes(payload)) {
        ids.push(payload);
        setPendingDeletes(ids);
      }
    } else {
      setDirty(true);
    }
  });
}

async function pushAll(state) {
  if (state.reservas.length) {
    await req('reservas', { method: 'POST', headers: UPSERT, body: JSON.stringify(state.reservas.map(reservaToRow)) });
  }
  await pushChange('cabins', state.cabins);
  await pushChange('config', state.config);
}

// ---- bajar el estado de la nube ----
async function pullAll() {
  const [reservas, cabins, configRows] = await Promise.all([
    req('reservas?select=*'),
    req('cabins?select=*&order=orden'),
    req('config?select=*&id=eq.1'),
  ]);
  return {
    reservas: reservas.map(rowToReserva),
    cabins: cabins.map((c) => ({ id: c.id, nombre: c.nombre, capacidad: c.capacidad })),
    config: configRows[0] ? { precioNoche: configRows[0].precios || {} } : null,
  };
}

// Compara sin mirar createdAt: Postgres lo guarda en otro formato y
// si no re-renderizaría en cada ciclo aunque nada haya cambiado.
function sameData(a, b) {
  const norm = (rs) =>
    JSON.stringify(rs.map(({ createdAt, ...r }) => r).sort((x, y) => x.id.localeCompare(y.id)));
  return (
    norm(a.reservas) === norm(b.reservas) &&
    JSON.stringify(a.cabins) === JSON.stringify(b.cabins) &&
    JSON.stringify(a.config) === JSON.stringify(b.config)
  );
}

// ---- ciclo principal ----
export function initSync(onRemoteUpdate) {
  setChangeListener(onLocalChange);

  async function cycle() {
    if (busy) return;
    busy = true;
    try {
      // 1) reintentar borrados que quedaron pendientes
      const pend = pendingDeletes();
      for (const id of pend) await pushChange('reserva-delete', id);
      if (pend.length) setPendingDeletes([]);

      // 2) subir cambios locales que no habían llegado
      const local = snapshot();
      if (isDirty()) {
        await pushAll(local);
        setDirty(false);
      }

      // 3) bajar el estado remoto
      const remote = await pullAll();

      // 4) migración: si la nube está vacía pero este dispositivo tiene
      //    reservas, subirlas (pasa una sola vez por dispositivo)
      if (remote.reservas.length === 0 && local.reservas.length > 0) {
        await pushAll(local);
      } else if (remote.config && !sameData(remote, snapshot())) {
        replaceAll(remote);
        onRemoteUpdate();
      }

      online = true;
      lastSyncAt = new Date();
    } catch {
      // Sin internet o Supabase caído: la app sigue con los datos locales
      online = false;
    } finally {
      busy = false;
    }
  }

  cycle();
  setInterval(cycle, POLL_MS);
  window.addEventListener('online', cycle);
}
