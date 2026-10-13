# OCode.js API Reference

OCode.js is a dependency-free JavaScript/TypeScript utility library. It is published as ESM with TypeScript declaration files. Examples below assume Node.js 18+ or a compatible modern browser runtime.

## Importing

```ts
import { slugify, retry, withQuery } from "ocode-js";
import { deepMerge } from "ocode-js/object";
import { fetchJson } from "ocode-js/http";
```

Build locally with `npm install && npm test`. The compiled entry points and declaration files are written to `dist/`.

## Strings — `ocode-js/string`

- `slugify(value)`: normalize text into a URL-friendly slug.
- `capitalize(value)`: uppercase the first character.
- `toKebabCase(value)`: convert text to kebab-case.
- `escapeHtml(value)`: escape common HTML special characters. This is not a rich-HTML sanitizer.
- `truncate(value, maxLength, suffix?)`: shorten text to the requested length; invalid negative limits throw `RangeError`.
- `toStringSafe(value)`: safely produce a string representation.

## Objects — `ocode-js/object`

- `isPlainObject(value)`: test whether a value is a plain object.
- `pick(object, keys)` / `omit(object, keys)`: create a shallow object containing or excluding selected keys.
- `deepMerge(target, source)`: recursively merge plain objects; arrays are replaced rather than concatenated.
- `getPath(object, path, fallback?)`: read a nested property using a path.
- `cloneJson(value)`: clone JSON-serializable data using JSON semantics.

Treat untrusted object keys and values carefully at application boundaries; these helpers do not replace schema validation.

## Async — `ocode-js/async`

- `sleep(ms, options?)`: wait for a duration; supports abort signals.
- `retry(operation, options?)`: retry a failing async operation with configurable attempts and delay/backoff.
- `dedupeAsync(operation)`: coalesce overlapping calls so they share the same in-flight result.
- `withTimeout(promise, ms)`: reject when the time limit is exceeded. A timeout does not necessarily cancel the underlying operation.

Use retries only for operations that are safe to repeat, or make the operation idempotent.

## URLs — `ocode-js/url`

- `withQuery(url, params)`: add/update query parameters; nullish values are omitted.
- `joinUrl(...parts)`: join URL path segments.
- `parseUrl(value, base?)`: parse a URL and return `null` when parsing fails.
- `stripTrackingParams(url)`: remove known tracking parameters.

## Validation — `ocode-js/validation`

- `isNonEmptyString(value)`
- `isEmail(value)`
- `isHttpUrl(value)`: accept HTTP(S) URLs, not arbitrary schemes.
- `isRecord(value)`: test for a non-array record.
- `isWithinRange(value, min, max)`
- `assertNonEmptyString(value, label?)`: assert a non-empty string or throw.

These are convenience checks, not a substitute for server-side authorization or domain-specific validation.

## HTTP — `ocode-js/http`

- `fetchJson(url, options?)`: fetch and decode a JSON response; check errors and validate returned data at the application boundary.
- `jsonHeaders(headers?)`: create headers suitable for JSON requests.
- `jsonRequest(url, body, options?)`: construct/send a JSON request according to the exported helper's options.

Network requests can fail, time out, or return untrusted data. Apply authentication, authorization, schema validation, and cancellation policies in your application.

## Browser storage — `ocode-js/browser`

- `getLocalStorage()`: safely obtain localStorage when the environment supports it.
- `readStorage(key, fallback?)`
- `writeStorage(key, value)`
- `removeStorage(key)`

Call browser storage helpers only in browser contexts. Do not store secrets, session tokens, or sensitive personal data in localStorage.

## Environment — `ocode-js/env`

- `getEnv(name, fallback?, options?)`
- `requireEnv(name, options?)`
- `getEnvBoolean(name, fallback?, options?)`
- `getEnvNumber(name, fallback?, options?)`

These helpers read the environment source supported by the runtime/options. Never expose server environment variables to client-side code or commit secrets to source control.

## Logger — `ocode-js/logger`

- `createLogger(options?)`: create a level-filtered logger with optional prefix and output sink.

Avoid logging secrets, authorization headers, credentials, or sensitive user content.

## Compatibility and release status

The public entry point and subpath exports are defined in `package.json`. The project currently targets Node.js 18+ and modern ESM-compatible toolchains. Browser-only APIs should be called only in the browser.

This document describes the initial API surface. Check the repository README and tagged release notes for the exact API supported by a particular version.
