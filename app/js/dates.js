// Utilidades de fechas.
// REGLA DE ORO: todas las fechas se manejan como strings "YYYY-MM-DD".
// Así evitamos los bugs de zona horaria que trae new Date(string).

export function pad2(n) {
  return String(n).padStart(2, '0');
}

// month: 1-12
export function toISO(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function todayISO() {
  const d = new Date();
  return toISO(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export function parseISO(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return { year, month, day };
}

export function addDays(iso, n) {
  const { year, month, day } = parseISO(iso);
  // El día puede "pasarse" (ej: 32) y Date lo corrige solo al mes siguiente
  const d = new Date(year, month - 1, day + n);
  return toISO(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export function nightsBetween(desde, hasta) {
  const a = parseISO(desde);
  const b = parseISO(hasta);
  const ms = new Date(b.year, b.month - 1, b.day) - new Date(a.year, a.month - 1, a.day);
  return Math.round(ms / 86400000);
}

// Dos rangos se pisan si uno empieza antes de que termine el otro.
// Como son strings ISO, se comparan con < y > directamente.
export function overlaps(aIn, aOut, bIn, bOut) {
  return aIn < bOut && bIn < aOut;
}

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_LARGO = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

// "vie 10 ene"
export function formatEs(iso) {
  const { year, month, day } = parseISO(iso);
  const d = new Date(year, month - 1, day);
  return `${DIAS[d.getDay()]} ${day} ${MESES[month - 1]}`;
}

// month: 1-12 -> "Enero"
export function monthName(month) {
  return MESES_LARGO[month - 1];
}
