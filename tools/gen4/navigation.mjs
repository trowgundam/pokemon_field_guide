export function promoteCollidingEntrancesToTransports(areas) {
  const relevant = area => area?.includeInNavigation === true
    || (area?.encounters.length ?? 0) + (area?.items.length ?? 0) + (area?.resources.length ?? 0)
      + (area?.specialPokemon.length ?? 0) + (area?.transports.length ?? 0) > 0;
  for (const area of areas.values()) {
    const byCoordinate = new Map();
    for (const entrance of area.entrances.filter(entry => entry.showMarker !== false && entry.targetId)) {
      const key = `${entrance.x},${entrance.y}`;
      if (!byCoordinate.has(key)) byCoordinate.set(key, []);
      byCoordinate.get(key).push(entrance);
    }
    const candidates = [];
    for (const [key, entries] of byCoordinate) {
      const choices = entries.filter(entry => relevant(areas.get(entry.targetId)));
      const destinations = new Map(choices.map(entry => [`${entry.targetId}|${entry.version}`, entry]));
      if (destinations.size < 2) continue;
      const [x, y] = key.split(',').map(Number);
      candidates.push({ key, x, y, choices, destinations, signature: [...destinations.keys()].sort().join('|') });
    }
    const remaining = [...candidates];
    while (remaining.length) {
      const cluster = [remaining.shift()];
      for (let index = 0; index < cluster.length; index++) {
        for (let candidate = remaining.length - 1; candidate >= 0; candidate--) {
          if (cluster[index].signature !== remaining[candidate].signature
            || Math.abs(cluster[index].x - remaining[candidate].x) + Math.abs(cluster[index].y - remaining[candidate].y) !== 1) continue;
          cluster.push(remaining[candidate]);
          remaining.splice(candidate, 1);
        }
      }
      const first = cluster.sort((left, right) => left.y - right.y || left.x - right.x)[0];
      const removed = new Set(cluster.flatMap(candidate => candidate.choices));
      area.entrances = area.entrances.filter(entry => !removed.has(entry));
      area.transports.push({
        id: `${area.id}:entrance-choices:${first.x}:${first.y}`,
        name: 'Entrance choices', x: first.x, y: first.y,
        destinations: [...first.destinations.values()].map((entry, index) => ({
          id: `destination-${index + 1}`, targetId: entry.targetId, name: entry.name, version: entry.version
        }))
      });
    }
  }
}
