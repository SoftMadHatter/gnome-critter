// Lecture minimale d'un source JavaScript pour les tests de traduction : les
// littéraux de chaîne (apostrophes, guillemets, gabarits) et la fonction qui
// les reçoit en argument. Les commentaires et les expressions rationnelles
// sont sautés. Ce n'est pas un analyseur complet : il suffit au code du dépôt.

const REGEX_AFTER = new Set([...'(,=:[!&|?{};+-*%<>~^']);
const REGEX_KEYWORDS = new Set(['return', 'typeof', 'case', 'of', 'in', 'void', 'delete', 'throw', 'new', 'else', 'do']);

/**
 * Littéraux de chaîne d'un source, dans l'ordre.
 * @returns {{value: string, line: number, template: boolean, dynamic: boolean, callee: string|null}[]}
 *   value : texte (les `${…}` d'un gabarit deviennent `{}`) ; dynamic : gabarit avec `${…}` ;
 *   callee : la fonction appelée la plus proche qui contient le littéral (`_`, `console.warn`,
 *   `Main.notify`…), null s'il est dans un tableau, un objet ou hors de tout appel
 */
export function stringLiterals(source) {
  const found = [];
  const masked = [...source]; // copie où textes, commentaires et expressions rationnelles sont effacés
  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (masked[k] !== '\n') masked[k] = ' ';
  };
  let i = 0;
  let previous = ''; // dernier caractère significatif
  let word = ''; // dernier mot, s'il précède directement

  const readQuoted = (quote) => {
    const start = i++;
    let value = '';
    while (i < source.length && source[i] !== quote) {
      if (source[i] === '\\') {
        value += { n: '\n', t: '\t' }[source[i + 1]] ?? source[i + 1];
        i += 2;
      } else value += source[i++];
    }
    i++;
    blank(start + 1, i - 1);
    found.push({ value, start, template: false, dynamic: false });
  };

  const readTemplate = () => {
    const start = i++;
    let value = '';
    let dynamic = false;
    let quasi = i;
    while (i < source.length && source[i] !== '`') {
      if (source[i] === '\\') {
        value += source[i + 1];
        i += 2;
      } else if (source.startsWith('${', i)) {
        blank(quasi, i);
        i += 2;
        code('}');
        i++;
        quasi = i;
        value += '{}';
        dynamic = true;
      } else value += source[i++];
    }
    blank(quasi, i);
    i++;
    found.push({ value, start, template: true, dynamic });
  };

  const readRegex = () => {
    const start = i++;
    let inClass = false;
    while (i < source.length) {
      const c = source[i];
      if (c === '\\') i += 2;
      else {
        i++;
        if (c === '[') inClass = true;
        else if (c === ']') inClass = false;
        else if (c === '/' && !inClass) break;
      }
    }
    while (/[a-z]/i.test(source[i] ?? '')) i++;
    blank(start, i);
  };

  function code(until) {
    let depth = 0;
    while (i < source.length) {
      const c = source[i];
      if (until && c === until && depth === 0) return;
      if (source.startsWith('//', i)) {
        const end = source.indexOf('\n', i);
        const stop = end < 0 ? source.length : end;
        blank(i, stop);
        i = stop;
        continue;
      }
      if (source.startsWith('/*', i)) {
        const stop = source.indexOf('*/', i) + 2;
        blank(i, stop);
        i = stop;
        continue;
      }
      if (c === "'" || c === '"' || c === '`') {
        if (c === '`') readTemplate();
        else readQuoted(c);
        previous = 'x';
        word = '';
        continue;
      }
      if (c === '/' && (previous === '' || REGEX_AFTER.has(previous) || REGEX_KEYWORDS.has(word))) {
        readRegex();
        previous = 'x';
        word = '';
        continue;
      }
      if (/\s/.test(c)) {
        i++;
        continue;
      }
      if (/[\w$]/.test(c)) {
        word = source.slice(i).match(/^[\w$]+/)[0];
        previous = 'x';
        i += word.length;
        continue;
      }
      if (c === '{') depth++;
      if (c === '}') depth--;
      previous = c;
      word = '';
      i++;
    }
  }

  code(null);
  const text = masked.join('');
  const calleeOf = (start) => {
    let depth = 0;
    for (let k = start - 1; k >= 0; k--) {
      const c = text[k];
      if (c === ')' || c === ']' || c === '}') depth++;
      else if (c === '(' || c === '[' || c === '{') {
        if (depth > 0) depth--;
        else if (c === '{' && text[k - 1] === '$') continue; // dans le `${…}` d'un gabarit : on remonte jusqu'à l'appel
        else return c === '(' ? text.slice(0, k).match(/([\w$.]+)\s*$/)?.[1] ?? null : null;
      }
    }
    return null;
  };
  return found
    .sort((a, b) => a.start - b.start)
    .map(({ start, ...literal }) => ({ ...literal, line: source.slice(0, start).split('\n').length, callee: calleeOf(start) }));
}
