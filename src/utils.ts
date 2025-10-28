import { ArrayDiff, PluginOptions, TrackedField } from './types';

/**
 * Time unit mapping for parsing human-readable time strings.
 */
const TIME_UNITS = {
  s: 1000, // seconds
  m: 60 * 1000, // minutes
  h: 60 * 60 * 1000, // hours
  d: 24 * 60 * 60 * 1000, // days
  w: 7 * 24 * 60 * 60 * 1000, // weeks
  M: 30 * 24 * 60 * 60 * 1000, // months
  y: 365 * 24 * 60 * 60 * 1000, // years
} as const;

/**
 * Check if a value is a Date object.
 * @param val - The value to check.
 * @returns True if the value is a Date object, false otherwise.
 */
export function isDate(val: unknown): val is Date {
  return Object.prototype.toString.call(val) === '[object Date]';
}

/**
 * Check if a value is a plain object (not an array, not a Date, not null).
 * @param val - The value to check.
 * @returns True if the value is a plain object, false otherwise.
 */
export function isObject(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === 'object' && !Array.isArray(val) && !isDate(val);
}

/**
 * Check if a string is an ISO date string (e.g., '2020-01-01T00:00:00.000Z').
 * @param val - The string to check.
 * @returns True if the string is an ISO date string, false otherwise.
 */
export function isIsoDateString(val: string): boolean {
  return typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/.test(val);
}

/**
 * Check if a value "exists" (not null, not undefined, not empty string).
 * @param val - The value to check.
 * @returns True if the value exists, false otherwise.
 */
export function exists(val: unknown): boolean {
  return val !== null && val !== undefined && val !== '';
}

/**
 * Deep equality check for two values (primitives, arrays, objects, dates).
 * @param a - First value.
 * @param b - Second value.
 * @returns True if values are deeply equal, false otherwise.
 */
export function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;

  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!isEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (isObject(a) && isObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
      if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
      if (!isEqual(a[key], b[key])) return false;
    }
    return true;
  }

  return false;
}

/**
 * Deep equality check for two values, with special handling for null/undefined and type coercion.
 * @param a - First value.
 * @param b - Second value.
 * @returns True if values are considered equal, false otherwise.
 */
export function areValuesEqual(a: unknown, b: unknown): boolean {
  if (a === null && b === null) {
    return true;
  }
  if (a === undefined && b === undefined) {
    return true;
  }
  if (a === null || b === null || a === undefined || b === undefined) {
    return false;
  }

  if (isDate(a) && isDate(b)) {
    return a.getTime() === b.getTime();
  }

  if (isDate(a) && typeof b === 'string') {
    return a.toISOString() === b;
  }

  if (typeof a === 'string' && isDate(b)) {
    return a === b.toISOString();
  }

  if (typeof a === 'number' && typeof b === 'string') {
    return false;
  }
  if (typeof a === 'string' && typeof b === 'number') {
    return false;
  }
  if (typeof a === 'boolean' && typeof b === 'string') {
    return false;
  }
  if (typeof a === 'string' && typeof b === 'boolean') {
    return false;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    return isEqual(a, b);
  }

  if (isObject(a) && isObject(b)) {
    return isEqual(a, b);
  }

  return a === b;
}

/**
 * Get a value from an object using dot notation.
 * @param obj - The object to query.
 * @param path - The dot-notated path (e.g., 'a.b.c').
 * @returns The value at the given path, or undefined if not found.
 */
export function getValueByPath(obj: Record<string, unknown> | null | undefined, path: string): unknown {
  if (!obj) return undefined;

  let current: unknown = obj[path];
  if (current) {
    return current;
  }

  const segments = path.split('.');
  current = obj;
  for (const segment of segments) {
    if (current === null) {
      return undefined;
    }
    if (Array.isArray(current)) {
      const idx = Number(segment);
      if (!Number.isInteger(idx)) {
        return undefined;
      }
      current = current[idx];
      continue;
    }
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[segment];
      continue;
    }

    return undefined;
  }
  return current;
}

/**
 * Set a value in an object using dot notation.
 * This function mutates the target object.
 * @param obj - The target object to modify.
 * @param path - The dot-notated path (e.g., 'a.b.c').
 * @param value - The value to set.
 */
export function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
      current[parts[i]] = {};
    }
    current = current[parts[i]] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

/**
 * Convert an array of objects to a map using a key field.
 * @param arr - The array of objects.
 * @param key - The key field to use for mapping.
 * @returns A map of key to object.
 */
export function arrayToKeyMap<T extends Record<string, unknown>>(
  arr: T[] | null | undefined,
  key: string
): Record<string, T> {
  const map: Record<string, T> = {};

  if (!Array.isArray(arr)) {
    return map;
  }

  for (const item of arr) {
    if (item && item[key]) {
      const keyValue = String(item[key]);
      map[keyValue] = item;
    }
  }

  return map;
}

/**
 * Convert a value to its string representation for logging.
 * @param val - The value to convert.
 * @returns String representation of the value.
 */
export function valueToString(val: unknown): string | null | undefined {
  if (val === null || val === undefined) {
    return val as null | undefined;
  }
  if (val instanceof Date) {
    return val.toISOString();
  }
  if (typeof val === 'string' && isIsoDateString(val)) {
    return val;
  }
  if (typeof val === 'object') {
    try {
      return JSON.stringify(val);
    } catch {
      return String(val);
    }
  }
  return String(val);
}

/**
 * Calculate the difference between two simple arrays (arrays of primitives).
 * @param before - The array before changes.
 * @param after - The array after changes.
 * @returns Object containing added and removed items.
 */
export function diffSimpleArray<T = unknown>(
  before: T[] | null | undefined,
  after: T[] | null | undefined
): ArrayDiff<T> {
  const beforeSet = new Set<T>(Array.isArray(before) ? before : []);
  const afterSet = new Set<T>(Array.isArray(after) ? after : []);
  const added = [...afterSet].filter((x) => !beforeSet.has(x));
  const removed = [...beforeSet].filter((x) => !afterSet.has(x));
  return { added, removed };
}

/**
 * Validate a single tracked field configuration.
 * @param field - The tracked field to validate.
 * @param path - The path for error reporting (e.g., 'trackedFields[0]').
 * @throws Error if the field configuration is invalid.
 */
export function validateTrackedField(field: TrackedField, path: string): void {
  if (!field || typeof field !== 'object') {
    throw new Error(`[mongoose-log-history] Each entry in ${path} must be an object.`);
  }

  if (!field.value || typeof field.value !== 'string') {
    throw new Error(`[mongoose-log-history] Each entry in ${path} must have a "value" string.`);
  }

  if (field.arrayType !== undefined && field.arrayType !== 'simple' && field.arrayType !== 'custom-key') {
    throw new Error(
      `[mongoose-log-history] "arrayType" in ${path}.${field.value} must be 'simple' or 'custom-key' if specified.`
    );
  }

  if (field.arrayType === 'custom-key' && (!field.arrayKey || typeof field.arrayKey !== 'string')) {
    throw new Error(
      `[mongoose-log-history] "arrayKey" is required and must be a string when "arrayType" is 'custom-key' in ${path}.${field.value}.`
    );
  }

  if (field.valueField !== undefined && typeof field.valueField !== 'string') {
    throw new Error(`[mongoose-log-history] "valueField" in ${path}.${field.value} must be a string if specified.`);
  }

  if (field.contextFields !== undefined) {
    const contextFields = field.contextFields;
    if (
      !Array.isArray(contextFields) &&
      (typeof contextFields !== 'object' ||
        contextFields === null ||
        ((contextFields as Record<string, unknown>).doc !== undefined &&
          !Array.isArray((contextFields as Record<string, unknown>).doc)) ||
        ((contextFields as Record<string, unknown>).item !== undefined &&
          !Array.isArray((contextFields as Record<string, unknown>).item)))
    ) {
      throw new Error(
        `[mongoose-log-history] "contextFields" in ${path}.${field.value} must be an array or an object with optional "doc" and "item" arrays.`
      );
    }
  }

  if (field.trackedFields !== undefined) {
    if (!Array.isArray(field.trackedFields)) {
      throw new Error(
        `[mongoose-log-history] "trackedFields" in ${path}.${field.value} must be an array if specified.`
      );
    }

    field.trackedFields.forEach((subField, idx) =>
      validateTrackedField(subField, `${path}.${field.value}.trackedFields[${idx}]`)
    );
  }
}

/**
 * Validate plugin options and provide helpful error messages.
 * @param options - The plugin options to validate.
 * @throws Error if options are invalid.
 */
export function validatePluginOptions(options: PluginOptions & { modelName: string }): void {
  if (!options.modelName || typeof options.modelName !== 'string') {
    throw new Error('[mongoose-log-history] "modelName" option is required and must be a string.');
  }

  if (!options.trackedFields || !Array.isArray(options.trackedFields)) {
    throw new Error('[mongoose-log-history] "trackedFields" option must be an array.');
  }

  options.trackedFields.forEach((field, idx) => validateTrackedField(field, `trackedFields[${idx}]`));

  if (options.batchSize !== undefined && (!Number.isInteger(options.batchSize) || options.batchSize <= 0)) {
    throw new Error('[mongoose-log-history] "batchSize" must be a positive integer.');
  }

  if (options.maxBatchLog !== undefined && (!Number.isInteger(options.maxBatchLog) || options.maxBatchLog <= 0)) {
    throw new Error('[mongoose-log-history] "maxBatchLog" must be a positive integer.');
  }

  if (options.logger) {
    if (typeof options.logger.error !== 'function' || typeof options.logger.warn !== 'function') {
      throw new Error('[mongoose-log-history] "logger" must have .error and .warn methods.');
    }
  }

  if (options.softDelete) {
    if (typeof options.softDelete !== 'object' && typeof options.softDelete !== 'function') {
      throw new Error('[mongoose-log-history] "softDelete" must be an object or a function.');
    }

    if (
      typeof options.softDelete === 'object' &&
      (typeof options.softDelete.field !== 'string' || options.softDelete.value === undefined)
    ) {
      throw new Error('[mongoose-log-history] "softDelete" must be an object with "field" (string) and "value".');
    }
  }

  if (options.contextFields !== undefined && !Array.isArray(options.contextFields)) {
    throw new Error('[mongoose-log-history] "contextFields" (plugin-level) must be an array.');
  }

  if (options.singleCollection !== undefined && typeof options.singleCollection !== 'boolean') {
    throw new Error('[mongoose-log-history] "singleCollection" must be a boolean.');
  }

  if (options.saveWholeDoc !== undefined && typeof options.saveWholeDoc !== 'boolean') {
    throw new Error('[mongoose-log-history] "saveWholeDoc" must be a boolean.');
  }

  if (options.modelKeyId !== undefined && typeof options.modelKeyId !== 'string') {
    throw new Error('[mongoose-log-history] "modelKeyId" must be a string.');
  }
}

/**
 * Deep clone an object to prevent mutations.
 * @param obj - The object to clone.
 * @returns A deep copy of the object.
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => deepClone(item)) as T;
  }

  if (isObject(obj)) {
    const cloned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      cloned[key] = deepClone(value);
    }
    return cloned as T;
  }

  return obj;
}

/**
 * Parse a human-readable time string (e.g., '2h', '1d', '1M', '1y') to a Date object.
 * This function calculates a date in the past from the current time.
 *
 * Supported units:
 * - s: seconds
 * - m: minutes
 * - h: hours
 * - d: days
 * - w: weeks
 * - M: months (30 days)
 * - y: years (365 days)
 *
 * @param str - The time string to parse, or an existing Date/number.
 * @returns A Date object representing the parsed time, or null if invalid.
 */
export function parseHumanTime(str: string | Date | number | null | undefined): Date | null {
  if (str instanceof Date) {
    return str;
  }

  if (typeof str === 'number') {
    return new Date(str);
  }

  if (typeof str !== 'string') {
    return null;
  }

  const match = str.trim().match(/^(\d+)([smhdwMy])$/);
  if (!match?.[1] || !match?.[2]) {
    return null;
  }

  const num = parseInt(match[1], 10);
  const unit = match[2] as keyof typeof TIME_UNITS;

  if (isNaN(num) || num < 0) {
    return null;
  }

  const multiplier = TIME_UNITS[unit];
  if (!multiplier) {
    return null;
  }

  const ms = num * multiplier;
  const now = Date.now();

  return new Date(now - ms);
}
