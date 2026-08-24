export function renderGroupsForMatrix(matrix) {
  const cells = matrix.id === 0 ? matrix.cells.filter(cell => cell.header) : matrix.cells;
  return [...Map.groupBy(cells, cell => cell.header ?? `matrix-${matrix.id}`)].map(([header, groupCells], index) => ({
    id: `matrix-${matrix.id}-group-${index}`,
    header: groupCells[0].header,
    cells: groupCells,
    minCellX: Math.min(...groupCells.map(cell => cell.x)),
    minCellZ: Math.min(...groupCells.map(cell => cell.z)),
    maxCellX: Math.max(...groupCells.map(cell => cell.x)),
    maxCellZ: Math.max(...groupCells.map(cell => cell.z))
  }));
}
