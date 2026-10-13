export default function BlogPage({ params }) {
  return `<h1>Bài viết: ${escapeHtml(params.slug)}</h1><p>Tham số động được trích xuất từ URL.</p>`;
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
