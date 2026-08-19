export function makeSkeletonRows(columns = 5, rows = 5) {
  return Array.from(
    { length: rows },
    () =>
      `<tr class="skeleton-row">${Array.from({ length: columns }, (_, index) => `<td><span class="skeleton" style="width:${index === 0 ? "76" : "58"}%"></span></td>`).join("")}</tr>`,
  ).join("");
}
