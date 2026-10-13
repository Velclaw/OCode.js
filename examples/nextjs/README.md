# Using OCode.js in Next.js

OCode.js is framework-agnostic. Most utilities can be imported from Server Components, route handlers, server actions, and client code. Browser storage helpers must only be called in the browser, for example inside a Client Component effect or event handler.

~~~tsx
// app/page.tsx — a Server Component
import { slugify, withQuery } from "ocode-js";

export default function Page() {
  const slug = slugify("Build with OCode.js");
  const docsUrl = withQuery("/docs", { from: "homepage", version: 1 });

  return (
    <main>
      <h1>Build with OCode.js</h1>
      <p>Generated slug: {slug}</p>
      <a href={docsUrl}>Read the docs</a>
    </main>
  );
}
~~~

After publishing, install it with npm install ocode-js. Until then, build the package locally or use a workspace dependency. Never import server secrets into a Client Component.
