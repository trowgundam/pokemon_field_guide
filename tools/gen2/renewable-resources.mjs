function removeItems(area, names, expected) {
  const removed = area.items.filter(item => names.includes(item.name));
  if (removed.length !== expected)
    throw new Error(`${area.id} renewable item audit found ${removed.length}; expected ${expected}.`);
  area.items = area.items.filter(item => !names.includes(item.name));
}

function requireMapEvent(read, label, pattern) {
  if (!pattern.test(read(`maps/${label}.asm`)))
    throw new Error(`${label} renewable resource location audit failed.`);
}

export function addGen2RenewableResources({ read, maps }) {
  requireMapEvent(read, 'MountMoonSquare', /^\s*bg_event\s+7,\s+7,\s+BGEVENT_ITEM,/m);
  requireMapEvent(read, 'Route36NationalParkGate', /^\s*object_event\s+0,\s+3,[^\n]*Route36OfficerScriptContest,/m);
  requireMapEvent(read, 'GoldenrodDeptStore5F', /^\s*object_event\s+7,\s+5,[^\n]*GoldenrodDeptStore5FReceptionistScript,/m);
  requireMapEvent(read, 'LakeOfRageMagikarpHouse', /^\s*object_event\s+2,\s+3,[^\n]*MagikarpLengthRaterScript,/m);
  const moon = maps.get('MAP_MOUNT_MOON_SQUARE');
  removeItems(moon, ['Moon Stone'], 1);
  moon.resources.push({
    name: 'Moon Stone', kind: 'Weekly hidden pickup', x: 7, y: 7,
    comment: 'Available after the Clefairy dance on Monday night.'
  });

  const contest = maps.get('MAP_ROUTE_36_NATIONAL_PARK_GATE');
  removeItems(contest, ['Sun Stone', 'Everstone', 'Gold Berry', 'Berry'], 4);
  contest.resources.push({
    name: 'Bug-Catching Contest prize', kind: 'Repeatable contest prize', x: 0, y: 3,
    comment: 'Available once each Tuesday, Thursday, and Saturday.',
    rewards: [
      { name: 'Sun Stone', quantity: 1, comment: 'First place.' },
      { name: 'Everstone', quantity: 1, comment: 'Second place.' },
      { name: 'Gold Berry', quantity: 1, comment: 'Third place.' },
      { name: 'Berry', quantity: 1, comment: 'Consolation prize.' }
    ]
  });

  const sunday = maps.get('MAP_GOLDENROD_DEPT_STORE_5F');
  removeItems(sunday, ['TM Return', 'TM Frustration'], 2);
  sunday.resources.push({
    name: 'Sunday TM reward', kind: 'Weekly happiness reward', x: 7, y: 5,
    comment: 'Available once each Sunday.',
    rewards: [
      { name: 'TM Return', quantity: 1, comment: 'Lead Pokémon happiness is at least 150.' },
      { name: 'TM Frustration', quantity: 1, comment: 'Lead Pokémon happiness is below 50.' }
    ]
  });

  const judge = maps.get('MAP_LAKE_OF_RAGE_MAGIKARP_HOUSE');
  const prize = judge.items.find(item => ['Ether', 'Elixer'].includes(item.name))?.name;
  if (!prize) throw new Error(`${judge.id} Magikarp judge reward audit failed.`);
  removeItems(judge, [prize], 1);
  judge.resources.push({
    name: prize, kind: 'Repeatable size record', x: 2, y: 3,
    comment: 'Awarded each time you beat your saved Magikarp length record.'
  });

  const lotto = maps.get('MAP_RADIO_TOWER_1F');
  requireMapEvent(read, 'RadioTower1F', /^RadioTower1FLuckyNumberManScript:/m);
  removeItems(lotto, ['Master Ball', 'Exp Share'], 2);

  const resourceCount = [...maps.values()].reduce((count, area) => count + area.resources.length, 0);
  if (resourceCount !== 34) throw new Error(`Generation II renewable resource audit found ${resourceCount}; expected 34.`);
}
