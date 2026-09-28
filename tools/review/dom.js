// Small DOM helpers for the review page (no dependencies).

/**
 * Creates an element: `h('td', { class: 'num', onclick: fn }, children...)`.
 * Children that are null, undefined, or false are ignored; text is escaped.
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (key in el && typeof value !== 'string') el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

/** Replaces an element's content; like h(), arrays are flattened and null, undefined, false ignored. */
export function fill(el, ...children) {
  el.replaceChildren(...children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false));
  return el;
}

/** Dropdown list: `options` = [[value, label], ...]. */
export function select(options, value, onChange, props = {}) {
  return h(
    'select',
    { ...props, onchange: (e) => onChange(e.target.value) },
    options.map(([v, label]) => h('option', { value: v, selected: v === value }, label)),
  );
}

/** Compact numeric field. */
export function numberInput(value, onChange, props = {}) {
  return h('input', { type: 'number', value: String(value), min: '0', ...props, oninput: (e) => onChange(Number(e.target.value) || 0) });
}

/** Label + control on one row. */
export function field(label, control) {
  return h('label', { class: 'field' }, h('span', {}, label), control);
}

/** Simple table: columns [title, (row) => content, class?]. */
export function table(columns, rows, { empty = 'Rien à afficher.' } = {}) {
  if (rows.length === 0) return h('p', { class: 'muted' }, empty);
  return h(
    'table',
    {},
    h('thead', {}, h('tr', {}, columns.map(([title, , cls]) => h('th', { class: cls }, title)))),
    h('tbody', {}, rows.map((row) => h('tr', {}, columns.map(([, cell, cls]) => h('td', { class: cls }, cell(row)))))),
  );
}

export function badge(text, kind = '') {
  return h('span', { class: `badge ${kind}` }, text);
}

export function debounce(fn, ms = 150) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/** Ephemeral message at the bottom of the page. */
export function toast(text) {
  const el = h('div', { class: 'toast' }, text);
  document.body.append(el);
  setTimeout(() => el.remove(), 1800);
}

/** Copies text to the clipboard (falls back to a text area if the API is missing). */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = h('textarea', { value: text });
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  toast('Copié dans le presse-papiers.');
}

/** Readable percentage: 0.427 -> "42,7 %" (French formatting, comma decimal). */
export function percent(ratio) {
  return `${(ratio * 100).toFixed(1).replace('.', ',')} %`;
}
