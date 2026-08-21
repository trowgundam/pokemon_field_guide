function connectedOutdoorPositions(seed, maps) {
  const outdoor = area => !area.excluded && ['TOWN', 'ROUTE'].includes(area.environment);
  const positions = new Map([[seed, { x: 0, y: 0 }]]), queue = [seed];
  while (queue.length) {
    const id = queue.shift(), area = maps.get(id), position = positions.get(id);
    for (const connection of area.connections) {
      const target = maps.get(connection.target);
      if (!target || !outdoor(target) || positions.has(connection.target)) continue;
      let x = position.x, y = position.y;
      if (connection.direction === 'north') { x += connection.offset * 32; y -= target.height * 32; }
      if (connection.direction === 'south') { x += connection.offset * 32; y += area.height * 32; }
      if (connection.direction === 'west') { x -= target.width * 32; y += connection.offset * 32; }
      if (connection.direction === 'east') { x += area.width * 32; y += connection.offset * 32; }
      positions.set(connection.target, { x, y });
      queue.push(connection.target);
    }
  }
  return positions;
}

function alignTopLeft(positions, id, point) {
  const anchor = positions.get(id);
  if (!anchor) throw new Error(`${id} is missing from its overworld component.`);
  const dx = point.x - anchor.x, dy = point.y - anchor.y;
  for (const position of positions.values()) { position.x += dx; position.y += dy; }
}

async function tiledRockImage(source, target, sharp) {
  const tileSize = 32, size = 320;
  const { data: tile } = await sharp(source).extract({ left: 0, top: 0, width: tileSize, height: tileSize })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const canvas = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const sourceOffset = ((y % tileSize) * tileSize + x % tileSize) * 4;
    tile.copy(canvas, (y * size + x) * 4, sourceOffset, sourceOffset + 4);
  }
  return sharp(canvas, { raw: { width: size, height: size, channels: 4 } }).png().toFile(target);
}

export async function createConnectedWorldLayout(maps, assets, sharp) {
  const johto = connectedOutdoorPositions('MAP_NEW_BARK_TOWN', maps);
  const route26 = johto.get('MAP_ROUTE_26');
  if (!route26) throw new Error('Route 26 is not connected to New Bark Town.');
  const junction = { x: route26.x, y: route26.y - 320, width: 320, height: 320 };

  const kanto = connectedOutdoorPositions('MAP_PALLET_TOWN', maps);
  alignTopLeft(kanto, 'MAP_ROUTE_22', { x: junction.x + junction.width, y: junction.y + 16 });
  const route28 = connectedOutdoorPositions('MAP_ROUTE_28', maps);
  alignTopLeft(route28, 'MAP_ROUTE_28', { x: junction.x - maps.get('MAP_ROUTE_28').mapWidth, y: junction.y + 16 });
  const route23 = connectedOutdoorPositions('MAP_ROUTE_23', maps);
  alignTopLeft(route23, 'MAP_ROUTE_23', { x: junction.x, y: junction.y - maps.get('MAP_ROUTE_23').mapHeight });

  const connectorImage = await assets.map('VICTORY_ROAD_OVERWORLD.png', target =>
    tiledRockImage(maps.get('MAP_ROUTE_22').mapImage.localPath, target, sharp));
  const connector = {
    id: 'MAP_VICTORY_ROAD_OVERWORLD', name: 'Victory Road', region: 'Johto & Kanto', encounters: [], items: [], resources: [], specialPokemon: [],
    entrances: [{ id: 'MAP_VICTORY_ROAD_OVERWORLD:entrance', targetId: 'MAP_VICTORY_ROAD', name: 'Victory Road', x: 10, y: 10 }],
    mapImage: connectorImage, mapWidth: junction.width, mapHeight: junction.height
  };
  maps.set(connector.id, connector);

  const positions = new Map([...johto, ...kanto, ...route28, ...route23]);
  positions.set(connector.id, { x: junction.x, y: junction.y });
  return { positions, crops: new Map() };
}

export async function renderConnectedWorld({ worldId, maps, layout, assets, sharp }) {
  const { positions, crops } = layout;
  const placed = [...positions].map(([id, position]) => {
    const crop = crops.get(id) ?? { left: 0, top: 0, width: maps.get(id).mapWidth, height: maps.get(id).mapHeight };
    return {
      id, x: position.x + crop.left, y: position.y + crop.top, width: crop.width, height: crop.height,
      markerOffsetX: crop.left / 16, markerOffsetY: crop.top / 16, crop
    };
  });
  const approachLayer = id => id === 'MAP_VICTORY_ROAD_OVERWORLD' ? 1 : 0;
  placed.sort((left, right) => approachLayer(left.id) - approachLayer(right.id));
  const minX = Math.min(...placed.map(item => item.x)), minY = Math.min(...placed.map(item => item.y));
  placed.forEach(item => { item.x -= minX; item.y -= minY; });
  const width = Math.max(...placed.map(item => item.x + item.width)), height = Math.max(...placed.map(item => item.y + item.height));
  const composites = await Promise.all(placed.map(async item => {
    const area = maps.get(item.id);
    const cropped = item.crop.left || item.crop.top || item.crop.width !== area.mapWidth || item.crop.height !== area.mapHeight;
    return {
      input: cropped ? await sharp(area.mapImage.localPath).extract(item.crop).png().toBuffer() : area.mapImage.localPath,
      left: item.x,
      top: item.y
    };
  }));
  const image = await assets.map('WORLD_JOHTO_KANTO.png', target => sharp({ create: { width, height, channels: 4, background: '#286f67' } })
    .composite(composites).png().toFile(target));
  return {
    id: worldId, image, width, height,
    maps: placed.map(({ crop, ...placement }) => placement)
  };
}
