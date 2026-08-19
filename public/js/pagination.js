export function renderPagination(pagination, onChange) {
  if (!pagination || pagination.pages < 2) return "";
  const pages = [];
  for (let page = 1; page <= pagination.pages; page += 1) {
    if (
      page === 1 ||
      page === pagination.pages ||
      Math.abs(page - pagination.page) <= 1
    )
      pages.push(page);
  }
  const buttons = pages
    .map(
      (page, index) =>
        `${index && page - pages[index - 1] > 1 ? '<span class="text-muted">…</span>' : ""}<button class="btn btn-sm ${page === pagination.page ? "btn-primary" : "btn-secondary"}" data-page="${page}">${page}</button>`,
    )
    .join("");
  queueMicrotask(() =>
    document
      .querySelectorAll("[data-page]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          window[onChange]?.(Number(button.dataset.page)),
        ),
      ),
  );
  return `<div class="pagination"><span class="pagination-info">Showing ${pagination.total} record${pagination.total === 1 ? "" : "s"}</span>${buttons}</div>`;
}
