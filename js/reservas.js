import {
  listReservas,
  listCabins,
  getReserva,
  createReserva,
  updateReserva,
  deleteReserva,
  getConfig,
} from './storage.js';
import { todayISO, formatEs, nightsBetween, addDays, overlaps } from './dates.js';
import { esc, money } from './ui.js';

const ESTADOS = ['pendiente', 'confirmada', 'cancelada'];
let mostrarTodas = false;

function cabinName(cabins, id) {
  return cabins.find((c) => c.id === id)?.nombre || 'Cabaña';
}

function saldoDe(r) {
  return Math.max(0, (r.total || 0) - (r.senia || 0));
}

// Link de WhatsApp con el mensaje de confirmación ya escrito
function waLink(r, cabins) {
  const tel = String(r.huesped.telefono || '').replace(/\D/g, '');
  const noches = nightsBetween(r.checkIn, r.checkOut);
  const saldo = saldoDe(r);
  const msg = [
    `Hola ${r.huesped.nombre}! Te confirmo tu reserva en Munay Ki 🌿`,
    `🏡 ${cabinName(cabins, r.cabinId)}`,
    `📅 ${formatEs(r.checkIn)} → ${formatEs(r.checkOut)} (${noches} noches)`,
    `💰 Total: ${money(r.total)}` + (saldo > 0 ? ` | Saldo: ${money(saldo)}` : ' | Pagado ✔'),
    `¡Te esperamos!`,
  ].join('\n');
  return `https://wa.me/${tel}?text=${encodeURIComponent(msg)}`;
}

// ---------------- LISTA ----------------

export function renderReservasList(container) {
  const reservas = listReservas();
  const cabins = listCabins();
  const hoy = todayISO();

  const visibles = reservas
    .filter((r) => mostrarTodas || (r.estado !== 'cancelada' && r.checkOut >= hoy))
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn));

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h2>Reservas</h2>
        <a class="btn btn-primary" href="#/reserva/nueva">＋ Nueva</a>
      </div>
      ${
        visibles.length === 0
          ? `<div class="empty">
              <strong>Todavía no hay reservas cargadas</strong>
              Andá al calendario, tocá el día de ingreso y apretá «＋ Nueva reserva».
              La app misma te avisa si las fechas se pisan con otra reserva.
            </div>`
          : `<div class="cards">${visibles.map((r, i) => cardHtml(r, cabins, i)).join('')}</div>`
      }
      <button type="button" class="btn btn-ghost btn-block" id="toggle-todas">
        ${mostrarTodas ? 'Ocultar pasadas y canceladas' : 'Ver pasadas y canceladas'}
      </button>
    </div>`;

  container.querySelector('#toggle-todas').addEventListener('click', () => {
    mostrarTodas = !mostrarTodas;
    renderReservasList(container);
  });

  container.querySelectorAll('[data-edit]').forEach((el) =>
    el.addEventListener('click', (e) => {
      if (e.target.closest('a')) return; // no pisar el botón de WhatsApp
      location.hash = '#/reserva/' + el.dataset.edit;
    })
  );
}

const COLORES = ['oklch(0.45 0.07 155)', 'oklch(0.56 0.115 52)', 'oklch(0.45 0.06 210)', 'oklch(0.48 0.07 320)'];

function colorOf(cabins, id) {
  const i = cabins.findIndex((c) => c.id === id);
  return COLORES[(i < 0 ? 0 : i) % COLORES.length];
}

function cardHtml(r, cabins, i) {
  const noches = nightsBetween(r.checkIn, r.checkOut);
  const saldo = saldoDe(r);
  return `
    <div class="card" data-edit="${r.id}" style="--i:${i}">
      <div class="card-top">
        <strong>${esc(r.huesped.nombre)}</strong>
        <span class="badge badge-${r.estado}">${r.estado}</span>
      </div>
      <div class="card-dates">${formatEs(r.checkIn)} → ${formatEs(r.checkOut)} · ${noches} noche${
    noches === 1 ? '' : 's'
  }</div>
      <div class="card-meta">
        <span class="badge-cabin" style="--c:${colorOf(cabins, r.cabinId)}">${esc(cabinName(cabins, r.cabinId))}</span>
        ${saldo > 0 && r.estado !== 'cancelada' ? `<span class="saldo">Debe ${money(saldo)}</span>` : ''}
      </div>
      ${
        r.estado !== 'cancelada'
          ? `<a class="btn btn-wa" href="${waLink(r, cabins)}" target="_blank" rel="noopener">Confirmar por WhatsApp ↗</a>`
          : ''
      }
    </div>`;
}

// ---------------- FORMULARIO (nueva / editar) ----------------

export function renderReservaForm(container, { id = null, fecha = null } = {}) {
  const cabins = listCabins();
  const config = getConfig();
  const editando = id ? getReserva(id) : null;

  if (id && !editando) {
    container.innerHTML = `
      <div class="page">
        <p class="empty">Reserva no encontrada.</p>
        <a class="btn" href="#/reservas">Volver</a>
      </div>`;
    return;
  }

  const checkInInicial = editando?.checkIn || fecha || todayISO();
  const inicial = editando || {
    cabinId: cabins[0]?.id,
    checkIn: checkInInicial,
    checkOut: fecha ? addDays(fecha, 2) : addDays(checkInInicial, 2),
    huesped: { nombre: '', telefono: '' },
    precioNoche: config.precioNoche[cabins[0]?.id] || 0,
    senia: 0,
    estado: 'pendiente',
    notas: '',
  };

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h2>${editando ? 'Editar reserva' : 'Nueva reserva'}</h2>
        <a class="btn btn-ghost" href="#/reservas">Volver</a>
      </div>

      <form id="form-reserva" class="form" novalidate>
        <p class="micro">La estadía</p>
        <label>Cabaña
          <select name="cabinId" id="f-cabin">
            ${cabins
              .map(
                (c) =>
                  `<option value="${c.id}" ${c.id === inicial.cabinId ? 'selected' : ''}>${esc(c.nombre)}</option>`
              )
              .join('')}
          </select>
        </label>

        <div class="form-row">
          <label>Ingreso
            <input type="date" name="checkIn" id="f-in" value="${inicial.checkIn}" required>
          </label>
          <label>Salida
            <input type="date" name="checkOut" id="f-out" value="${inicial.checkOut}" required>
          </label>
        </div>

        <p class="micro">El huésped</p>
        <label>Nombre
          <input type="text" name="nombre" id="f-nombre" value="${esc(inicial.huesped.nombre)}"
            placeholder="Ej: María González" autocomplete="name" required>
        </label>

        <label>Teléfono (con código de país)
          <input type="tel" name="telefono" id="f-tel" value="${esc(inicial.huesped.telefono)}"
            placeholder="Ej: 5493447123456" required>
          <small class="hint" id="tel-hint" hidden></small>
        </label>

        <p class="micro">El dinero</p>
        <div class="form-row">
          <label>Precio por noche ($)
            <input type="number" name="precioNoche" id="f-precio" min="0" inputmode="numeric"
              value="${inicial.precioNoche}">
          </label>
          <label>Seña pagada ($)
            <input type="number" name="senia" id="f-senia" min="0" inputmode="numeric" value="${inicial.senia || 0}">
          </label>
        </div>

        <div class="ticket" id="resumen"></div>

        <p class="micro">Detalles</p>
        <label>Estado
          <select name="estado" id="f-estado">
            ${ESTADOS.map(
              (e) => `<option value="${e}" ${e === inicial.estado ? 'selected' : ''}>${e}</option>`
            ).join('')}
          </select>
        </label>

        <label>Notas
          <textarea name="notas" id="f-notas" rows="2"
            placeholder="Ej: vienen con mascota, pidieron cuna">${esc(inicial.notas || '')}</textarea>
        </label>

        <p class="form-error" id="form-error" hidden></p>

        <button type="submit" class="btn btn-primary btn-block">Guardar</button>

        ${
          editando
            ? `
          <a class="btn btn-wa btn-block" href="${waLink(editando, cabins)}" target="_blank" rel="noopener">
            Enviar confirmación por WhatsApp ↗
          </a>
          ${
            editando.estado !== 'cancelada'
              ? '<button type="button" class="btn btn-ghost btn-block" id="btn-cancelar">Cancelar reserva</button>'
              : ''
          }
          <button type="button" class="btn btn-danger btn-block" id="btn-eliminar">Eliminar</button>`
            : ''
        }
      </form>
    </div>`;

  const $ = (sel) => container.querySelector(sel);

  function leerForm() {
    return {
      cabinId: $('#f-cabin').value,
      checkIn: $('#f-in').value,
      checkOut: $('#f-out').value,
      nombre: $('#f-nombre').value.trim(),
      telefono: $('#f-tel').value.trim(),
      precioNoche: Number($('#f-precio').value) || 0,
      senia: Number($('#f-senia').value) || 0,
      estado: $('#f-estado').value,
      notas: $('#f-notas').value.trim(),
    };
  }

  function actualizarResumen() {
    const f = leerForm();
    const noches = f.checkIn && f.checkOut ? nightsBetween(f.checkIn, f.checkOut) : 0;
    const total = noches > 0 ? noches * f.precioNoche : 0;
    const saldo = Math.max(0, total - f.senia);
    $('#resumen').innerHTML =
      noches > 0
        ? `<span class="ticket-line">${noches} noche${noches === 1 ? '' : 's'} × ${money(f.precioNoche)}</span>
           <span class="ticket-total">${money(total)}</span>
           <span class="ticket-saldo">Saldo al llegar: ${money(saldo)}</span>`
        : '<span class="ticket-line">Elegí las fechas para ver el total.</span>';
  }

  // Al cambiar de cabaña en una reserva NUEVA, sugerir su precio configurado
  $('#f-cabin').addEventListener('change', () => {
    if (!editando) {
      $('#f-precio').value = config.precioNoche[$('#f-cabin').value] || 0;
    }
    actualizarResumen();
  });

  ['#f-in', '#f-out', '#f-precio', '#f-senia'].forEach((sel) =>
    $(sel).addEventListener('input', actualizarResumen)
  );

  // Si el teléfono ya existe en otra reserva, ofrecer autocompletar el nombre
  $('#f-tel').addEventListener('blur', () => {
    const tel = $('#f-tel').value.trim();
    const hint = $('#tel-hint');
    if (!tel || $('#f-nombre').value.trim()) {
      hint.hidden = true;
      return;
    }
    const previa = listReservas().find((r) => r.huesped.telefono === tel && r.huesped.nombre);
    if (previa) {
      $('#f-nombre').value = previa.huesped.nombre;
      hint.textContent = `Se completó el nombre de una reserva anterior (${formatEs(previa.checkIn)}).`;
      hint.hidden = false;
    } else {
      hint.hidden = true;
    }
  });

  function mostrarError(msg) {
    const el = $('#form-error');
    el.textContent = msg;
    el.hidden = false;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  $('#form-reserva').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = leerForm();

    if (!f.nombre || !f.telefono) return mostrarError('Completá nombre y teléfono del huésped.');
    if (!f.checkIn || !f.checkOut) return mostrarError('Completá las fechas de ingreso y salida.');
    if (f.checkOut <= f.checkIn) return mostrarError('La salida tiene que ser después del ingreso.');

    // La regla de oro: una cabaña no puede tener dos reservas superpuestas
    const choque = listReservas().find(
      (r) =>
        r.id !== id &&
        r.estado !== 'cancelada' &&
        r.cabinId === f.cabinId &&
        overlaps(f.checkIn, f.checkOut, r.checkIn, r.checkOut)
    );
    if (choque) {
      return mostrarError(
        `La ${cabinName(cabins, f.cabinId)} ya está reservada del ${formatEs(choque.checkIn)} al ${formatEs(
          choque.checkOut
        )} (${choque.huesped.nombre}).`
      );
    }

    const noches = nightsBetween(f.checkIn, f.checkOut);
    const data = {
      cabinId: f.cabinId,
      checkIn: f.checkIn,
      checkOut: f.checkOut,
      huesped: { nombre: f.nombre, telefono: f.telefono },
      precioNoche: f.precioNoche,
      total: noches * f.precioNoche,
      senia: f.senia,
      estado: f.estado,
      notas: f.notas,
    };

    if (editando) {
      updateReserva(id, data);
    } else {
      createReserva(data);
    }
    location.hash = '#/reservas';
  });

  const btnCancelar = $('#btn-cancelar');
  if (btnCancelar) {
    btnCancelar.addEventListener('click', () => {
      updateReserva(id, { estado: 'cancelada' });
      location.hash = '#/reservas';
    });
  }

  const btnEliminar = $('#btn-eliminar');
  if (btnEliminar) {
    btnEliminar.addEventListener('click', () => {
      if (confirm('¿Eliminar esta reserva? No se puede deshacer.')) {
        deleteReserva(id);
        location.hash = '#/reservas';
      }
    });
  }

  actualizarResumen();
}
