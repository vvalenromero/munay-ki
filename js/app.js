import { renderCalendar } from './calendar.js';
import { renderReservasList, renderReservaForm } from './reservas.js';
import { renderConfig } from './config.js';
import { initSync } from './sync.js';

const app = document.getElementById('app');

// Rutas:
//   #/                  calendario
//   #/reservas          lista
//   #/reserva/nueva     formulario (opcional ?fecha=YYYY-MM-DD)
//   #/reserva/:id       formulario editando
//   #/config            configuración
// Marca en la nav inferior la sección activa
function setActiveNav() {
  const h = location.hash || '#/';
  const seccion = h.startsWith('#/reserva') ? 'res' : h.startsWith('#/config') ? 'cfg' : 'cal';
  document.querySelectorAll('.bottom-nav a').forEach((a) => {
    a.classList.toggle('active', a.dataset.nav === seccion);
  });
}

function route() {
  const hash = location.hash || '#/';
  const [path, query] = hash.replace(/^#/, '').split('?');
  const params = new URLSearchParams(query || '');

  setActiveNav();

  if (path === '/' || path === '') return renderCalendar(app);
  if (path === '/reservas') return renderReservasList(app);
  if (path === '/reserva/nueva') return renderReservaForm(app, { fecha: params.get('fecha') });
  if (path.startsWith('/reserva/')) return renderReservaForm(app, { id: path.split('/')[2] });
  if (path === '/config') return renderConfig(app);

  renderCalendar(app);
}

window.addEventListener('hashchange', route);
route();

// Arranca la réplica con Supabase: cuando otro dispositivo cambie algo,
// se baja solo y se re-dibuja la pantalla actual.
initSync(() => route());
