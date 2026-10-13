import { slugify, withQuery } from "ocode-js";

export default function HomePage() {
  const slug = slugify("Build with OCode.js");
  const docsUrl = withQuery("/docs", { from: "homepage", version: 1 });

  return (
    <main style={{ maxWidth: 720, margin: "4rem auto", padding: "0 1.25rem", fontFamily: "system-ui" }}>
      <p style={{ color: "#3478f6", fontWeight: 700 }}>OCode.js × Next.js</p>
      <h1>Small utilities. Clear code.</h1>
      <p>Generated slug: <code>{slug}</code></p>
      <a href={docsUrl}>Explore documentation</a>
    </main>
  );
}
