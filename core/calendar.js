// Calendar for seasonal achievements: weather season and the day's
// holidays, in local time. Pure module (the date is always passed as a
// parameter).

export const SEASONS = Object.freeze(['spring', 'summer', 'autumn', 'winter']);
export const HOLIDAYS = Object.freeze(['newyear', 'valentine', 'easter', 'halloween', 'christmas']);

/** Weather season (northern hemisphere): spring = March to May, etc. */
export function seasonOf(date) {
  const month = date.getMonth(); // 0 = January
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'autumn';
  return 'winter';
}

/** Easter Sunday (Gregorian calendar, the "anonymous" algorithm): { month (1-12), day }. */
export function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

/** The day's holidays: New Year (January 1), Valentine's Day, Easter (Sunday and Monday), Halloween, Christmas (December 24-25). */
export function holidaysOn(date) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const found = [];
  if (month === 1 && day === 1) found.push('newyear');
  if (month === 2 && day === 14) found.push('valentine');
  const easter = easterSunday(date.getFullYear());
  const monday = new Date(date.getFullYear(), easter.month - 1, easter.day + 1);
  if ((month === easter.month && day === easter.day) || (month === monday.getMonth() + 1 && day === monday.getDate())) {
    found.push('easter');
  }
  if (month === 10 && day === 31) found.push('halloween');
  if (month === 12 && (day === 24 || day === 25)) found.push('christmas');
  return found;
}
