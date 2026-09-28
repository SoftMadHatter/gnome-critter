// Reads the desktop's state via the GNOME Shell APIs (Meta/global) and
// translates it into the plain structures expected by `core/surfaceMap.js`.
// This is the only boundary between GJS and the pure core: if the toolkit
// ever changes, only this file (and critterActor.js/manager.js) changes.

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
 * "Normal" windows of the active workspace, with their frame rect
 * (decorations included: it's the visible top that acts as a ledge). Minimized
 * windows are ignored (nothing to latch onto), as are special windows
 * (popups, docks...).
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
 * Bounding rectangle of every monitor (used as a safety net and as
 * bounds for flight).
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
