export function blockPaths(read) {
  const paths = new Map(), pending = [];
  for (const line of read('data/maps/blocks.asm').split(/\r?\n/)) {
    const label = line.match(/^([A-Za-z0-9]+)_Blocks:/)?.[1];
    if (label) pending.push(label);
    const included = line.match(/INCBIN\s+"([^"]+\.blk)"/)?.[1];
    if (included) { for (const name of pending) paths.set(name, included); pending.length = 0; }
  }
  return paths;
}
