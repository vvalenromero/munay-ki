import { listCabins, saveCabins, getConfig, saveConfig, snapshot, replaceAll } from './storage.js';
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
            : '📴 Modo local: los datos se guardan en este dispositivo. Bajá un respaldo desde acá para no depender de un solo teléfono.'
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
      <section class="config-section">
        <p class="micro">Respaldo de datos</p>
        <p class="hint">Descargá un respaldo cada tanto. Si el teléfono se rompe o se pierde, restaurás todas las reservas desde el archivo.</p>
        <button type="button" class="btn btn-primary btn-block" id="btn-export">Descargar respaldo</button>
        <button type="button" class="btn btn-block" id="btn-import">Restaurar desde archivo</button>
        <input type="file" id="file-import" accept="application/json" hidden>
      </section>
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

  // ---- Respaldo local (exportar / restaurar) ----
  container.querySelector('#btn-export').addEventListener('click', () => {
    const data = snapshot();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'munayki-respaldo-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  container.querySelector('#btn-import').addEventListener('click', () => {
    container.querySelector('#file-import').click();
  });

  container.querySelector('#file-import').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data.reservas) || !Array.isArray(data.cabins) || !data.config) {
          throw new Error('formato');
        }
        replaceAll(data);
        const ok = container.querySelector('#config-ok');
        ok.textContent = 'Restaurado ✔';
        ok.hidden = false;
      } catch {
        alert('El archivo no parece un respaldo válido de Munay Ki.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });
}
