# OCode.js API Reference

OCode.js is a dependency-free JavaScript/TypeScript utility library distributed as ESM with TypeScript declaration files. Examples assume Node.js 18+ or a compatible modern browser runtime.

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

- `sleep(ms, signal?)`: wait for a finite, non-negative duration; an optional `AbortSignal` can cancel the wait.
- `retry(operation, options?)`: retry an async operation. Options are `attempts` (integer >= 1), `delayMs` (finite >= 0), `factor` (finite >= 1), `maxDelayMs` (finite >= 0), and `shouldRetry(error, attempt)`.
- `dedupeAsync(operation)`: coalesce overlapping calls so they share the same in-flight result. Calls made while pending share the first call's arguments and result.
- `withTimeout(promise, ms, message?)`: reject when the time limit is exceeded. A timeout does not necessarily cancel the underlying operation.

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

- `fetchJson(input, init?)`: call `fetch`, check the HTTP response, and decode JSON. Validate returned data at the application boundary.
- `jsonHeaders(headers?)`: create a `Headers` object with JSON Accept/Content-Type defaults while preserving supplied headers.
- `jsonRequest(body, init?)`: return a `RequestInit` object with JSON-stringified body and JSON headers. It does not perform the network request itself.

Example:

```ts
const response = await fetch("/api/items", jsonRequest({ name: "example" }, { method: "POST" }));
const data = await response.json();
```

Network requests can fail, time out, or return untrusted data. Apply authentication, authorization, schema validation, and cancellation policies in your application.

## Browser storage — `ocode-js/browser`

The storage helpers receive a Storage-like object explicitly, which makes them testable and lets callers handle environments where browser storage is unavailable.

- `getLocalStorage()`: safely obtain `localStorage` when the environment supports it; otherwise return `null`.
- `readStorage(storage, key, fallback)`: parse the JSON value at `key`; return `fallback` when missing, malformed, or inaccessible.
- `writeStorage(storage, key, value)`: JSON-serialize and store a value; return a boolean indicating success.
- `removeStorage(storage, key)`: remove a key and return a boolean indicating success.

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
