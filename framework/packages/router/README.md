# @ocodejs/router

File-system route discovery and route matching for OCodejs. Requires Node.js 18+ and has no runtime dependencies.

Conventions under `src/app`: `page`, `layout`, `loading`, `error` with `.js`, `.jsx`, `.ts`, `.tsx` extensions. Example: `blog/[slug]/page.tsx` maps to `/blog/:slug`; route groups such as `(marketing)` do not affect the URL. Private directories beginning with `_` are skipped, symlinks rejected, static routes take precedence over dynamic routes.

```js
import { scanAppDirectory, matchRoute } from '@ocodejs/router';
const manifest = await scanAppDirectory('./src/app');
const match = matchRoute(manifest, '/blog/hello-world?from=home');
// match?.params => { slug: 'hello-world' }
```

The manifest contains absolute page paths and inherited layout/loading/error paths. Catch-all routes are not supported yet.
