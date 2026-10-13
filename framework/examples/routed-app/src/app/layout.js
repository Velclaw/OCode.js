/** Wrap children as HTML in the demo document with its header and navigation. */
export default function RootLayout({ children }) {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>OCodejs demo</title></head><body><header><a href="/">OCodejs</a> · <a href="/blog/hello">Blog demo</a></header><main>${children}</main></body></html>`;
}
