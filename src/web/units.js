/**
 * Unit handling for label dimensions
 *
 * All geometry is stored and rendered in millimetres - inches are purely a
 * display and input convention layered on top, so nothing in the canvas or
 * print path has to know which unit the user picked.
 */

export const MM_PER_INCH = 25.4;

export const UNITS = {
  MM: 'mm',
  IN: 'in',
};

/**
 * @param {string} unit - Current display unit
 * @returns {boolean}
 */
export function isInches(unit) {
  return unit === UNITS.IN;
}

/**
 * Convert millimetres into the display unit
 * @param {number} mm - Value in millimetres
 * @param {string} unit - Display unit
 * @returns {number}
 */
export function fromMm(mm, unit) {
  const value = Number(mm);
  if (!Number.isFinite(value)) return 0;
  return isInches(unit) ? value / MM_PER_INCH : value;
}

/**
 * Convert a value the user entered in the display unit back to millimetres
 * @param {string|number} value - Value in the display unit
 * @param {string} unit - Display unit
 * @returns {number}
 */
export function toMm(value, unit) {
  const parsed = parseFloat(value);
  if (!Number.isFinite(parsed)) return 0;
  return isInches(unit) ? parsed * MM_PER_INCH : parsed;
}

/**
 * Format a millimetre value for display, trimming trailing zeros
 * @param {number} mm - Value in millimetres
 * @param {string} unit - Display unit
 * @returns {string} - e.g. "40" or "1.57"
 */
export function formatLength(mm, unit) {
  const value = fromMm(mm, unit);
  // Inches need two places to distinguish 1.25 from 1.19; mm rarely need any
  const rounded = value.toFixed(isInches(unit) ? 2 : 1);
  return String(parseFloat(rounded));
}

/**
 * Format a width x height pair with its unit
 * @param {number} widthMm
 * @param {number} heightMm
 * @param {string} unit - Display unit
 * @returns {string} - e.g. "40 x 30 mm" or "4 x 6 in"
 */
export function formatSize(widthMm, heightMm, unit) {
  return `${formatLength(widthMm, unit)} x ${formatLength(heightMm, unit)} ${unit}`;
}

/**
 * Step size for a numeric dimension input in this unit
 * @param {string} unit - Display unit
 * @returns {number}
 */
export function inputStep(unit) {
  return isInches(unit) ? 0.05 : 1;
}

/**
 * Round a millimetre value to the precision the display unit can express,
 * so a value typed in inches survives a round trip through the input
 * @param {number} mm - Value in millimetres
 * @param {string} unit - Display unit
 * @returns {number}
 */
export function quantize(mm, unit) {
  return toMm(formatLength(mm, unit), unit);
}
