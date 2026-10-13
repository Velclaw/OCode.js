/** Return the demo blog HTML with params.slug escaped for display as text. */
export default function BlogPage({ params }) {
  return `<h1>Bài viết: ${escapeHtml(params.slug)}</h1><p>Tham số động được trích xuất từ URL.</p>`;
}
/** Convert a value to text and escape HTML metacharacters, including both quote characters. */
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
