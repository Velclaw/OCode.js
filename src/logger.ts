export type LogLevel = "debug" | "info" | "warn" | "error";
export interface LoggerOptions { level?: LogLevel; prefix?: string; sink?: Pick<Console, "debug" | "info" | "warn" | "error">; }
const weights: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
/** Configurable logger with no global configuration or third-party dependency. */
export function createLogger(options: LoggerOptions = {}) {
  const threshold = weights[options.level ?? "info"], prefix = options.prefix ? "[" + options.prefix + "]" : "", sink = options.sink ?? console;
  const write = (level: LogLevel, ...args: unknown[]) => { if (weights[level] >= threshold) sink[level](...(prefix ? [prefix, ...args] : args)); };
  return {
    debug: (...args: unknown[]) => write("debug", ...args),
    info: (...args: unknown[]) => write("info", ...args),
    warn: (...args: unknown[]) => write("warn", ...args),
    error: (...args: unknown[]) => write("error", ...args)
  };
}
