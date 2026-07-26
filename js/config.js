import { listCabins, saveCabins, getConfig, saveConfig } from './storage.js';
import { syncStatus } from './sync.js';
import { esc } from './ui.js';

export function renderConfig(container) {
  const cabins = listCabins();
  const config = getConfig();
  const { online, lastSyncAt } = syncStatus();

  container.innerHTML = `
    <div class="page">
      <h2>Configuración</h2>
      <p class="hint">El precio por noche se usa para sugerir el total al cargar una reserva.</p>
      <p class="hint">
        ${
          online
            ? `☁️ Sincronizado con la nube${
                lastSyncAt
                  ? ' · ' + lastSyncAt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
                  : ''
              }`
            : '📴 Sin conexión. Los cambios se guardan en este dispositivo y se suben solos cuando vuelva internet.'
        }
      </p>
      <form id="form-config" class="form">
        ${cabins
          .map(
            (c, i) => `
          <section class="config-section">
            <p class="micro">Cabaña ${i + 1}</p>
            <label>Nombre
              <input name="nombre_${c.id}" value="${esc(c.nombre)}" required>
            </label>
            <label>Precio por noche ($)
              <input name="precio_${c.id}" type="number" min="0" inputmode="numeric"
                value="${config.precioNoche[c.id] || 0}">
            </label>
          </section>`
          )
          .join('')}
        <button type="submit" class="btn btn-primary btn-block">Guardar</button>
        <p class="ok" id="config-ok" hidden>Guardado ✔</p>
      </form>
    </div>`;

  container.querySelector('#form-config').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);

    const nuevasCabins = cabins.map((c) => ({
      ...c,
      nombre: String(fd.get('nombre_' + c.id)).trim() || c.nombre,
    }));
    const precios = {};
    cabins.forEach((c) => {
      precios[c.id] = Number(fd.get('precio_' + c.id)) || 0;
    });

    saveCabins(nuevasCabins);
    saveConfig({ ...config, precioNoche: precios });
    container.querySelector('#config-ok').hidden = false;
  });
}
