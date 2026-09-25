// Accessoires cosmétiques (chapeaux, nœud, lunettes...) achetés à la boutique,
// et points d'ancrage de la tête déclarés par les packs. Module pur.

/**
 * `months` : mois (1-12) pendant lesquels l'accessoire est gratuit et disponible ; sans `months`, achat à `price`.
 * `trophy` : jamais en boutique, offert quand le joueur atteint ce nombre de succès.
 * `joke` : jamais en boutique, récompense farfelue de certains succès (et des boîtes du Système).
 */
export const ACCESSORIES = Object.freeze({
  partyhat: { label: 'Chapeau de fête', price: 20 },
  bow: { label: 'Nœud', price: 15 },
  glasses: { label: 'Lunettes', price: 30 },
  crown: { label: 'Couronne', price: 80 },
  santa: { label: 'Bonnet de Noël', price: 0, months: [12] },
  witch: { label: 'Chapeau de sorcière', price: 0, months: [10] },
  medal: { label: 'Médaille', trophy: 25 },
  laurel: { label: 'Couronne de laurier', trophy: 50 },
  halo: { label: 'Auréole', trophy: 100 },
  cone: { label: 'Cône de la honte', joke: true },
  sock: { label: 'Chaussette', joke: true },
  foilhat: { label: 'Chapeau en papier alu', joke: true },
});

/** Accessoire hors boutique (trophée ou farce), obtenu autrement qu'en l'achetant. */
export function isSpecial(id) {
  return Boolean(ACCESSORIES[id]?.trophy || ACCESSORIES[id]?.joke);
}

/** Trophées atteints avec `count` succès : `[{id, label}]`, du plus petit seuil au plus grand. */
export function trophiesFor(count) {
  return Object.entries(ACCESSORIES)
    .filter(([, def]) => def.trophy && count >= def.trophy)
    .sort((a, b) => a[1].trophy - b[1].trophy)
    .map(([id, def]) => ({ id, label: def.label }));
}

/** Prix en pièces d'un aliment premium (les autres sont gratuits). */
export const FOOD_PRICES = Object.freeze({ meat: 2, fish: 3, pate: 2 });

export function inSeason(id, date) {
  const months = ACCESSORIES[id]?.months;
  return !months || months.includes(date.getMonth() + 1);
}

/**
 * Accessoires proposés à la boutique à cette date : achetables (avec leur
 * prix) et de saison (gratuits).
 * @param {Date} date
 * @param {string[]} owned
 * @returns {{id: string, label: string, price: number, owned: boolean, free: boolean}[]}
 */
export function shopList(date, owned) {
  return Object.entries(ACCESSORIES)
    .filter(([id]) => !isSpecial(id) && inSeason(id, date))
    .map(([id, def]) => ({ id, label: def.label, price: def.price, free: def.price === 0, owned: owned.includes(id) }));
}

/** Accessoires qu'un animal peut porter maintenant : achetés, gratuits de saison, trophées et farces obtenus. */
export function equippable(date, owned) {
  const special = Object.entries(ACCESSORIES)
    .filter(([id]) => isSpecial(id) && owned.includes(id))
    .map(([id, def]) => ({ id, label: def.label, price: 0, free: false, owned: true }));
  return [...shopList(date, owned).filter((a) => a.owned || a.free), ...special];
}

/**
 * Placement d'un accessoire sur la tête. `offset` : décalage vers le bas, en
 * fraction de sa taille (les chapeaux reposent sur l'ancrage ; le nœud, la
 * cocarde et les lunettes se placent plus bas, l'auréole flotte au-dessus, le
 * cône de la honte entoure la tête) ; `scale` : taille relative (1 = la
 * moitié de la largeur du sprite).
 */
export const ACCESSORY_LAYOUT = Object.freeze({
  glasses: { offset: 0.45 },
  bow: { offset: 0.3 },
  medal: { offset: 0.3 },
  laurel: { offset: 0.3 },
  halo: { offset: -0.35 },
  cone: { offset: 0.85, scale: 1.6 },
});

/**
 * Carré où dessiner un accessoire sur un sprite affiché dans `box` (même
 * calcul pour l'extension et l'outil de revue).
 * @param {string} id
 * @param {{x:number, y:number, width:number, height:number}} box rectangle du sprite
 * @param {{x:number, y:number}} head ancrage de la tête (fractions, sprite tourné vers la droite)
 * @param {number} facing 1 (droite) ou -1 (gauche)
 * @returns {{x:number, y:number, size:number}}
 */
export function accessoryPlacement(id, box, head, facing) {
  const layout = ACCESSORY_LAYOUT[id] ?? {};
  const size = Math.max(6, Math.round((box.width / 2) * (layout.scale ?? 1)));
  const ax = box.x + (facing >= 0 ? head.x : 1 - head.x) * box.width;
  const ay = box.y + head.y * box.height + (layout.offset ?? 0) * size;
  return { x: Math.round(ax - size / 2), y: Math.round(ay - size), size };
}

const DEFAULT_HEAD_ANCHOR = { x: 0.72, y: 0.2 };

/**
 * Valide la section `anchors` d'un pack : point de la tête (fractions de la
 * taille du sprite, sprite tourné vers la droite), où se pose un chapeau.
 * @returns {{anchors: {head: {x:number, y:number}}, ignored: string[]}}
 */
export function anchorsOverrides(raw) {
  const anchors = { head: { ...DEFAULT_HEAD_ANCHOR } };
  const ignored = [];
  for (const [key, value] of Object.entries(raw ?? {})) {
    const ok =
      key === 'head' &&
      value &&
      Number.isFinite(value.x) && value.x >= 0 && value.x <= 1 &&
      Number.isFinite(value.y) && value.y >= 0 && value.y <= 1;
    if (ok) anchors.head = { x: value.x, y: value.y };
    else ignored.push(key);
  }
  return { anchors, ignored };
}
