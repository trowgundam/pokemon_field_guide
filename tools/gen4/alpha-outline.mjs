const pointKey = (x, y) => `${x},${y}`;

function simplify(points, tolerance) {
  const collinear = points.filter((point, index) => {
    const previous = points[(index + points.length - 1) % points.length];
    const following = points[(index + 1) % points.length];
    return (point.x - previous.x) * (following.y - point.y) !== (point.y - previous.y) * (following.x - point.x);
  });
  if (tolerance <= 0 || collinear.length <= 4) return collinear;

  const distanceToSegment = (point, start, end) => {
    const dx = end.x - start.x, dy = end.y - start.y;
    if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
    const position = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(point.x - start.x - position * dx, point.y - start.y - position * dy);
  };
  const simplifyOpen = line => {
    let farthest = 0, split = -1;
    for (let index = 1; index < line.length - 1; index++) {
      const distance = distanceToSegment(line[index], line[0], line.at(-1));
      if (distance > farthest) { farthest = distance; split = index; }
    }
    if (farthest <= tolerance) return [line[0], line.at(-1)];
    const left = simplifyOpen(line.slice(0, split + 1)), right = simplifyOpen(line.slice(split));
    return [...left.slice(0, -1), ...right];
  };
  let split = 1;
  for (let index = 2; index < collinear.length; index++) {
    if (Math.hypot(collinear[index].x - collinear[0].x, collinear[index].y - collinear[0].y)
      > Math.hypot(collinear[split].x - collinear[0].x, collinear[split].y - collinear[0].y)) split = index;
  }
  const first = simplifyOpen(collinear.slice(0, split + 1));
  const second = simplifyOpen([...collinear.slice(split), collinear[0]]);
  return [...first.slice(0, -1), ...second.slice(0, -1)];
}

function signedArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index++) {
    const point = points[index], following = points[(index + 1) % points.length];
    area += point.x * following.y - following.x * point.y;
  }
  return area / 2;
}

function traceComponent(cells, maskWidth, blockSize, sourceWidth, sourceHeight, offsetX, offsetY, tolerance) {
  const membership = new Set(cells);
  const edges = [], byStart = new Map();
  const addEdge = (startX, startY, endX, endY, direction) => {
    const edge = { id: edges.length, startX, startY, endX, endY, direction };
    edges.push(edge);
    const key = pointKey(startX, startY);
    if (!byStart.has(key)) byStart.set(key, []);
    byStart.get(key).push(edge);
  };
  for (const cell of cells) {
    const x = cell % maskWidth, y = Math.floor(cell / maskWidth);
    if (!membership.has(cell - maskWidth)) addEdge(x, y, x + 1, y, 0);
    if (!membership.has(cell + 1) || x === maskWidth - 1) addEdge(x + 1, y, x + 1, y + 1, 1);
    if (!membership.has(cell + maskWidth)) addEdge(x + 1, y + 1, x, y + 1, 2);
    if (!membership.has(cell - 1) || x === 0) addEdge(x, y + 1, x, y, 3);
  }

  const unused = new Set(edges.map(edge => edge.id)), loops = [];
  while (unused.size) {
    const first = edges[unused.values().next().value], points = [], startKey = pointKey(first.startX, first.startY);
    let edge = first;
    while (edge && unused.has(edge.id)) {
      unused.delete(edge.id);
      points.push({ x: edge.startX, y: edge.startY });
      const endKey = pointKey(edge.endX, edge.endY);
      if (endKey === startKey) break;
      const candidates = (byStart.get(endKey) ?? []).filter(candidate => unused.has(candidate.id));
      const directions = [(edge.direction + 1) % 4, edge.direction, (edge.direction + 3) % 4, (edge.direction + 2) % 4];
      edge = directions.map(direction => candidates.find(candidate => candidate.direction === direction)).find(Boolean);
    }
    if (points.length >= 4 && signedArea(points) !== 0) loops.push(points);
  }
  const exterior = loops.sort((left, right) => Math.abs(signedArea(right)) - Math.abs(signedArea(left)))[0];
  if (!exterior) return [];
  if (signedArea(exterior) < 0) exterior.reverse();
  return [simplify(exterior, tolerance).map(point => ({
    x: offsetX + Math.min(sourceWidth, point.x * blockSize),
    y: offsetY + Math.min(sourceHeight, point.y * blockSize)
  }))];
}

export function traceAlphaMaskRegions(data, width, height, {
  blockSize = 4,
  alphaThreshold = 16,
  minComponentPixels = 64,
  offsetX = 0,
  offsetY = 0,
  simplifyTolerance = 1
} = {}) {
  const maskWidth = Math.ceil(width / blockSize), maskHeight = Math.ceil(height / blockSize);
  const mask = new Uint8Array(maskWidth * maskHeight);
  for (let maskY = 0; maskY < maskHeight; maskY++) for (let maskX = 0; maskX < maskWidth; maskX++) {
    const maxX = Math.min(width, (maskX + 1) * blockSize), maxY = Math.min(height, (maskY + 1) * blockSize);
    for (let y = maskY * blockSize; y < maxY && !mask[maskY * maskWidth + maskX]; y++) {
      for (let x = maskX * blockSize; x < maxX; x++) if (data[y * width + x] >= alphaThreshold) {
        mask[maskY * maskWidth + maskX] = 1;
        break;
      }
    }
  }

  const seen = new Uint8Array(mask.length), minimumCells = Math.max(1, Math.ceil(minComponentPixels / (blockSize * blockSize)));
  const polygons = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    const cells = [start]; seen[start] = 1;
    for (let cursor = 0; cursor < cells.length; cursor++) {
      const cell = cells[cursor], x = cell % maskWidth;
      for (const neighbor of [cell - maskWidth, cell + maskWidth, x > 0 ? cell - 1 : -1, x < maskWidth - 1 ? cell + 1 : -1]) {
        if (neighbor >= 0 && neighbor < mask.length && mask[neighbor] && !seen[neighbor]) {
          seen[neighbor] = 1;
          cells.push(neighbor);
        }
      }
    }
    if (cells.length >= minimumCells) polygons.push(...traceComponent(
      cells, maskWidth, blockSize, width, height, offsetX, offsetY, simplifyTolerance));
  }
  return polygons;
}

export function traceAlphaRegions(data, width, height, options = {}) {
  const alpha = new Uint8Array(width * height);
  for (let index = 0; index < alpha.length; index++) alpha[index] = data[index * 4 + 3];
  return traceAlphaMaskRegions(alpha, width, height, options);
}
