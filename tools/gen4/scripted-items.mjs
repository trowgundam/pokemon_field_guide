export function addScriptedItems(areas, items, rewards, verifySource) {
  const ids = new Set();
  for (const reward of rewards) {
    const area = areas.get(reward.areaId), item = items.get(reward.itemId);
    if (!area) throw new Error(`Scripted reward area ${reward.areaId} is missing.`);
    if (!item) throw new Error(`Scripted reward item ${reward.itemId} is missing.`);
    verifySource(reward, item);
    const suffix = reward.key ?? reward.itemId.toLowerCase();
    const id = `${reward.areaId}:event:${suffix}`;
    if (ids.has(id)) throw new Error(`Duplicate scripted reward ID ${id}.`);
    ids.add(id);
    area.items.push({
      id, name: item.name, kind: 'Event', version: reward.version ?? 'Both',
      iconId: item.icon, ...(item.iconPalette == null ? {} : { iconPaletteId: item.iconPalette }),
      x: -1, y: -1, quantity: reward.quantity ?? 1
    });
  }
}
