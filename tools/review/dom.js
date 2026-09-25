// Petits outils DOM de la page de revue (sans dépendance).

/**
 * Crée un élément : `h('td', { class: 'num', onclick: fn }, enfants...)`.
 * Les enfants null, undefined ou false sont ignorés ; le texte est échappé.
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

/** Remplace le contenu d'un élément ; comme pour h(), les tableaux sont aplatis et null, undefined, false ignorés. */
export function fill(el, ...children) {
  el.replaceChildren(...children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false));
  return el;
}

/** Liste déroulante : `options` = [[valeur, libellé], ...]. */
export function select(options, value, onChange, props = {}) {
  return h(
    'select',
    { ...props, onchange: (e) => onChange(e.target.value) },
    options.map(([v, label]) => h('option', { value: v, selected: v === value }, label)),
  );
}

/** Champ numérique compact. */
export function numberInput(value, onChange, props = {}) {
  return h('input', { type: 'number', value: String(value), min: '0', ...props, oninput: (e) => onChange(Number(e.target.value) || 0) });
}

/** Libellé + contrôle sur une ligne. */
export function field(label, control) {
  return h('label', { class: 'field' }, h('span', {}, label), control);
}

/** Tableau simple : colonnes [titre, (ligne) => contenu, classe?]. */
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

/** Message éphémère en bas de page. */
export function toast(text) {
  const el = h('div', { class: 'toast' }, text);
  document.body.append(el);
  setTimeout(() => el.remove(), 1800);
}

/** Copie un texte dans le presse-papiers (repli sur une zone de texte si l'API manque). */
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

/** Pourcentage lisible : 0,427 -> « 42,7 % ». */
export function percent(ratio) {
  return `${(ratio * 100).toFixed(1).replace('.', ',')} %`;
}
