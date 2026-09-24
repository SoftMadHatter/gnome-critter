// Accessoires cosmétiques (chapeaux, nœud, lunettes...) achetés à la boutique,
// et points d'ancrage de la tête déclarés par les packs. Module pur.

/** `months` : mois (1-12) pendant lesquels l'accessoire est gratuit et disponible ; sans `months`, achat à `price`. */
export const ACCESSORIES = Object.freeze({
  partyhat: { label: 'Chapeau de fête', price: 20 },
  bow: { label: 'Nœud', price: 15 },
  glasses: { label: 'Lunettes', price: 30 },
  crown: { label: 'Couronne', price: 80 },
  santa: { label: 'Bonnet de Noël', price: 0, months: [12] },
  witch: { label: 'Chapeau de sorcière', price: 0, months: [10] },
});

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
    .filter(([id]) => inSeason(id, date))
    .map(([id, def]) => ({ id, label: def.label, price: def.price, free: def.price === 0, owned: owned.includes(id) }));
}

/** Accessoires qu'un animal peut porter maintenant : achetés ou gratuits de saison. */
export function equippable(date, owned) {
  return shopList(date, owned).filter((a) => a.owned || a.free);
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
