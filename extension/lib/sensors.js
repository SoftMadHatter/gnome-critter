// Lit l'état du bureau via les API GNOME Shell (Meta/global) et le traduit
// dans les structures simples attendues par `core/surfaceMap.js`. C'est la
// seule frontière entre GJS et le cœur pur : si demain on change de
// toolkit, seul ce fichier (et critterActor.js/manager.js) change.

import Meta from 'gi://Meta';

/** @returns {{x:number,y:number,width:number,height:number}[]} */
export function getMonitors() {
  const monitors = [];
  const n = global.display.get_n_monitors();
  for (let i = 0; i < n; i++) {
    const rect = global.display.get_monitor_geometry(i);
    monitors.push({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
  }
  return monitors;
}

/**
 * Fenêtres « normales » de l'espace de travail actif, avec leur frame rect
 * (décorations comprises : c'est bien le haut visible qui sert de rebord).
 * On ignore les fenêtres minimisées (rien à quoi s'accrocher) et les
 * fenêtres spéciales (popups, docks...).
 *
 * @returns {{id:number,x:number,y:number,width:number,height:number,focused:boolean}[]}
 */
export function getWindows() {
  const windows = [];
  const workspace = global.workspace_manager.get_active_workspace();

  for (const win of workspace.list_windows()) {
    if (win.minimized) continue;
    if (win.get_window_type() !== Meta.WindowType.NORMAL) continue;
    if (!win.showing_on_its_workspace()) continue;

    const rect = win.get_frame_rect();
    windows.push({
      id: win.get_id(),
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      focused: win.has_focus(),
    });
  }

  return windows;
}

/** @returns {{x:number,y:number}} */
export function getPointer() {
  const [x, y] = global.get_pointer();
  return { x, y };
}

/**
 * Rectangle englobant tous les moniteurs (utilisé comme filet de sécurité
 * et comme bornes pour le vol).
 * @param {{x:number,y:number,width:number,height:number}[]} monitors
 */
export function computeWorldBounds(monitors) {
  if (monitors.length === 0) {
    return { x: 0, y: 0, width: 1920, height: 1080 };
  }
  const minX = Math.min(...monitors.map((m) => m.x));
  const minY = Math.min(...monitors.map((m) => m.y));
  const maxX = Math.max(...monitors.map((m) => m.x + m.width));
  const maxY = Math.max(...monitors.map((m) => m.y + m.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
