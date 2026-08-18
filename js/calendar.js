import { listReservas, listCabins } from './storage.js';
import { todayISO, toISO, addDays, formatEs, monthName, parseISO, nightsBetween } from './dates.js';
import { esc, money } from './ui.js';

// Un color por cabaña (por posición en la lista) — verde bosque y terracota
const COLORES = ['oklch(0.45 0.07 155)', 'oklch(0.56 0.115 52)', 'oklch(0.45 0.06 210)', 'oklch(0.48 0.07 320)'];

// Mes que se está mirando y día seleccionado (empiezan en hoy)
let view = parseISO(todayISO());
let selected = todayISO();

// Una reserva ocupa [checkIn, checkOut): el día del checkout queda LIBRE
function ocupan(dia, reservas) {
  return reservas.filter((r) => r.estado !== 'cancelada' && r.checkIn <= dia && dia < r.checkOut);
}

function shiftMonth(delta) {
  const d = new Date(view.year, view.month - 1 + delta, 1);
  view = { year: d.getFullYear(), month: d.getMonth() + 1, day: 1 };
}

export function renderCalendar(container) {
  const reservas = listReservas();
  const cabins = listCabins();
  const hoy = todayISO();

  const colorOf = (id) => {
    const i = cabins.findIndex((c) => c.id === id);
    return COLORES[(i < 0 ? 0 : i) % COLORES.length];
  };
  const nombreOf = (id) => cabins.find((c) => c.id === id)?.nombre || 'Cabaña';
  const filaOf = (id) => cabins.findIndex((c) => c.id === id) + 1; // cada cabaña en su fila

  // La grilla arranca el lunes anterior (o el mismo) al día 1 del mes
  const diaUno = toISO(view.year, view.month, 1);
  const weekdayUno = (new Date(view.year, view.month - 1, 1).getDay() + 6) % 7; // 0 = lunes
  const start = addDays(diaUno, -weekdayUno);

  // Siempre 6 semanas (42 celdas) para que el alto no "salte" entre meses
  const celdas = [];
  let d = start;
  for (let i = 0; i < 42; i++) {
    celdas.push(d);
    d = addDays(d, 1);
  }

  const celdasHtml = celdas
    .map((dia) => {
      const { month, day } = parseISO(dia);
      const clases = ['cal-day'];
      if (month !== view.month) clases.push('otro-mes');
      if (dia === hoy) clases.push('hoy');
      if (dia === selected) clases.push('seleccionado');

      // Barras de estadía: un segmento por reserva que ocupa el día,
      // conectadas visualmente entre celdas (inicio / medio / fin)
      const barras = ocupan(dia, reservas)
        .map((r) => {
          const esInicio = r.checkIn === dia;
          const esFin = addDays(dia, 1) === r.checkOut;
          const forma = esInicio && esFin ? 'bar-solo' : esInicio ? 'bar-start' : esFin ? 'bar-end' : '';
          return `<span class="bar ${r.estado} ${forma}" style="--c:${colorOf(r.cabinId)};grid-row:${filaOf(
            r.cabinId
          )}">${esInicio ? `<span class="bar-name">${esc(r.huesped.nombre)}</span>` : ''}</span>`;
        })
        .join('');

      return `<button type="button" class="${clases.join(' ')}" data-dia="${dia}"
        style="--n-cabins:${cabins.length}">
        <span class="num">${day}</span>
        <span class="bars">${barras}</span>
      </button>`;
    })
    .join('');

  // Detalle del día seleccionado
  const delDia = ocupan(selected, reservas);
  const detalleHtml =
    delDia.length === 0
      ? `<div class="empty">
          <strong>Día libre</strong>
          El ${formatEs(selected)} está disponible. Es un buen día para ofrecer por WhatsApp 🌿
        </div>`
      : delDia
          .map((r, i) => {
            const noches = nightsBetween(r.checkIn, r.checkOut);
            const saldo = Math.max(0, (r.total || 0) - (r.senia || 0));
            return `<a class="card card-link" style="--i:${i}" href="#/reserva/${r.id}">
              <div class="card-top">
                <strong>${esc(r.huesped.nombre)}</strong>
                <span class="badge badge-${r.estado}">${r.estado}</span>
              </div>
              <div class="card-dates">${formatEs(r.checkIn)} → ${formatEs(r.checkOut)} · ${noches} noche${
              noches === 1 ? '' : 's'
            }</div>
              <div class="card-meta">
                <span class="badge-cabin" style="--c:${colorOf(r.cabinId)}">${esc(nombreOf(r.cabinId))}</span>
                ${saldo > 0 ? `<span class="saldo">Debe ${money(saldo)}</span>` : ''}
              </div>
            </a>`;
          })
          .join('');

  container.innerHTML = `
    <div class="page">
      <div class="cal-header">
        <button type="button" class="btn btn-nav" data-mes="-1" aria-label="Mes anterior">‹</button>
        <h2>${monthName(view.month)} ${view.year}</h2>
        <button type="button" class="btn btn-nav" data-mes="1" aria-label="Mes siguiente">›</button>
      </div>
      <div class="cal-grid">
        <span class="cal-wd">L</span><span class="cal-wd">M</span><span class="cal-wd">M</span>
        <span class="cal-wd">J</span><span class="cal-wd">V</span><span class="cal-wd">S</span><span class="cal-wd">D</span>
        ${celdasHtml}
      </div>
      <div class="day-detail">
        <h3>${formatEs(selected)}</h3>
        ${detalleHtml}
        <a class="btn btn-primary btn-block" href="#/reserva/nueva?fecha=${selected}">＋ Nueva reserva</a>
      </div>
    </div>`;

  container.querySelectorAll('[data-mes]').forEach((b) =>
    b.addEventListener('click', () => {
      shiftMonth(Number(b.dataset.mes));
      renderCalendar(container);
    })
  );

  container.querySelectorAll('[data-dia]').forEach((c) =>
    c.addEventListener('click', () => {
      selected = c.dataset.dia;
      renderCalendar(container);
    })
  );
}
