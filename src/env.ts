export interface EnvReadOptions { source?: Record<string, string | undefined>; emptyIsMissing?: boolean; }
function readSource(source?: Record<string, string | undefined>): Record<string, string | undefined> {
  if (source) return source;
  const maybeProcess = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return maybeProcess?.env ?? {};
}
export function getEnv(name: string, fallback?: string, options: EnvReadOptions = {}): string | undefined {
  const source = readSource(options.source);
  const value = Object.prototype.hasOwnProperty.call(source, name) ? source[name] : undefined;
  if (value === undefined || (options.emptyIsMissing !== false && value.trim() === "")) return fallback;
  return value;
}
export function requireEnv(name: string, options: EnvReadOptions = {}): string {
  const value = getEnv(name, undefined, options);
  if (value === undefined) throw new Error("Missing required environment variable: " + name);
  return value;
}
export function getEnvBoolean(name: string, fallback = false, options: EnvReadOptions = {}): boolean {
  const value = getEnv(name, undefined, options);
  if (value === undefined) return fallback;
  if (/^(1|true|yes|on)$/i.test(value.trim())) return true;
  if (/^(0|false|no|off)$/i.test(value.trim())) return false;
  return fallback;
}
export function getEnvNumber(name: string, fallback?: number, options: EnvReadOptions & { min?: number; max?: number } = {}): number | undefined {
  const value = getEnv(name, undefined, options);
  if (value === undefined || !/^-?\d+$/.test(value.trim())) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || (options.min !== undefined && parsed < options.min) || (options.max !== undefined && parsed > options.max)) return fallback;
  return parsed;
}
