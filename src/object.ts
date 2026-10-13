export type PlainRecord = Record<string, unknown>;
export function isPlainObject(value: unknown): value is PlainRecord {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
function defineOwn(target: object, key: PropertyKey, value: unknown): void {
  Object.defineProperty(target, key, { value, enumerable: true, configurable: true, writable: true });
}
/** Pick own enumerable properties from an object. */
export function pick<T extends object, K extends keyof T>(value: T, keys: readonly K[]): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (Object.prototype.propertyIsEnumerable.call(value, key)) defineOwn(result, key, value[key]);
  }
  return result;
}
/** Omit selected own enumerable properties from an object. */
export function omit<T extends object, K extends keyof T>(value: T, keys: readonly K[]): Omit<T, K> {
  const excluded = new Set<PropertyKey>(keys);
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    if (!excluded.has(key)) defineOwn(result, key, (value as Record<string, unknown>)[key]);
  }
  return result as Omit<T, K>;
}
/** Recursively merge plain objects; arrays and other values are replaced. */
export function deepMerge<T extends PlainRecord, U extends PlainRecord>(target: T, source: U): T & U {
  const result: PlainRecord = { ...target };
  for (const [key, value] of Object.entries(source)) {
    const merged = isPlainObject(result[key]) && isPlainObject(value)
      ? deepMerge(result[key] as PlainRecord, value)
      : value;
    // Define an own data property so a JSON "__proto__" key cannot mutate the result prototype.
    defineOwn(result, key, merged);
  }
  return result as T & U;
}
/** Safely read a nested property using a dot-separated path. */
export function getPath<T = unknown>(value: unknown, path: string, fallback?: T): unknown | T {
  if (!path) return value ?? fallback;
  let current: unknown = value;
  for (const segment of path.split(".")) {
    if (current === null || typeof current !== "object" || !Object.prototype.hasOwnProperty.call(current, segment)) return fallback;
    current = (current as Record<string, unknown>)[segment];
  }
  return current === undefined ? fallback : current;
}
/** Clone JSON-compatible data. Throws when the value cannot be represented as JSON. */
export function cloneJson<T>(value: T): T {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new TypeError("Value is not JSON-serializable");
  return JSON.parse(encoded) as T;
}
