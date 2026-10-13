/**
 * Compose middleware in registration order. Each middleware receives (request, next).
 * next() returns a promise for the downstream result, which middleware may transform.
 * Returning without calling next short-circuits the pipeline. The returned handler
 * resolves with the first middleware's result, or the terminal result if none exist;
 * uncaught handler errors and repeated next() errors reject it. Each request has
 * its own pipeline state.
 * Throws TypeError if middleware is not an array of functions or terminalHandler
 * is not a function.
 */
export function composeMiddleware(middleware, terminalHandler) {
  if (!Array.isArray(middleware) || middleware.some((item) => typeof item !== 'function')) throw new TypeError('Middleware must be an array of functions.');
  if (typeof terminalHandler !== 'function') throw new TypeError('A terminal handler function is required.');
  return function composed(request) {
    let lastIndex = -1;
    async function dispatch(index) {
      if (index <= lastIndex) throw new Error('next() called more than once in middleware pipeline.');
      lastIndex = index;
      const handler = index === middleware.length ? terminalHandler : middleware[index];
      return handler(request, () => dispatch(index + 1));
    }
    return dispatch(0);
  };
}