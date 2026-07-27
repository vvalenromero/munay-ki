// Capa de datos: el ÚNICO lugar que toca localStorage.
// La app siempre lee y escribe acá (instantáneo, funciona sin internet).
// sync.js se registra con setChangeListener y replica cada cambio en
// Supabase para que todos los dispositivos vean lo mismo.

const K_CABINS = 'munayki:cabins';
const K_RESERVAS = 'munayki:reservas';
const K_CONFIG = 'munayki:config';

// sync.js se engancha acá para enterarse de cada escritura local
let changeListener = () => {};
export function setChangeListener(fn) {
  changeListener = fn;
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// Datos iniciales: se crean solo la primera vez que se abre la app
function seed() {
  if (!localStorage.getItem(K_CABINS)) {
    write(K_CABINS, [
      { id: 'c1', nombre: 'Cabaña 1', capacidad: 6 },
      { id: 'c2', nombre: 'Cabaña 2', capacidad: 6 },
    ]);
  }
  if (!localStorage.getItem(K_CONFIG)) {
    write(K_CONFIG, { precioNoche: { c1: 0, c2: 0 } });
  }
  if (!localStorage.getItem(K_RESERVAS)) {
    write(K_RESERVAS, []);
  }
}
seed();

// --- Cabañas ---
export function listCabins() {
  return read(K_CABINS, []);
}

export function saveCabins(cabins) {
  write(K_CABINS, cabins);
  changeListener('cabins', cabins);
}

// --- Config ---
export function getConfig() {
  return read(K_CONFIG, { precioNoche: {} });
}

export function saveConfig(cfg) {
  write(K_CONFIG, cfg);
  changeListener('config', cfg);
}

// --- Reservas ---
export function listReservas() {
  return read(K_RESERVAS, []);
}

export function getReserva(id) {
  return listReservas().find((r) => r.id === id) || null;
}

export function createReserva(data) {
  const reservas = listReservas();
  const reserva = { ...data, id: uid(), createdAt: new Date().toISOString() };
  reservas.push(reserva);
  write(K_RESERVAS, reservas);
  changeListener('reserva-upsert', reserva);
  return reserva;
}

export function updateReserva(id, data) {
  let actualizada = null;
  const reservas = listReservas().map((r) => {
    if (r.id !== id) return r;
    actualizada = { ...r, ...data, id };
    return actualizada;
  });
  write(K_RESERVAS, reservas);
  if (actualizada) changeListener('reserva-upsert', actualizada);
}

export function deleteReserva(id) {
  write(K_RESERVAS, listReservas().filter((r) => r.id !== id));
  changeListener('reserva-delete', id);
}

// --- Puente para sync.js ---
export function snapshot() {
  return { cabins: listCabins(), config: getConfig(), reservas: listReservas() };
}

// Reemplaza todo el estado local por el que vino de la nube
export function replaceAll({ cabins, config, reservas }) {
  write(K_CABINS, cabins);
  write(K_CONFIG, config);
  write(K_RESERVAS, reservas);
}
