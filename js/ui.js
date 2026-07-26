// Helpers chicos de interfaz.

// Escapa texto del usuario antes de meterlo en el HTML
// (evita que un nombre con <script> rompa la página).
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

// 40000 -> "$40.000"
export function money(n) {
  return '$' + Number(n || 0).toLocaleString('es-AR');
}
