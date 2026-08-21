export async function copySpriteWithTransparentBackground(source, target, sharp, firstFrame = false) {
  const metadata = await sharp(source).metadata();
  const pipeline = firstFrame
    ? sharp(source).extract({ left: 0, top: 0, width: metadata.width, height: metadata.width })
    : sharp(source);
  const { data, info } = await pipeline.toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const borderCounts = new Map();
  const colorKey = pixel => `${data[pixel]},${data[pixel + 1]},${data[pixel + 2]},${data[pixel + 3]}`;
  const countBorder = (x, y) => {
    const key = colorKey((y * info.width + x) * 4);
    borderCounts.set(key, (borderCounts.get(key) ?? 0) + 1);
  };
  for (let x = 0; x < info.width; x++) { countBorder(x, 0); countBorder(x, info.height - 1); }
  for (let y = 1; y < info.height - 1; y++) { countBorder(0, y); countBorder(info.width - 1, y); }
  const background = [...borderCounts].sort((a, b) => b[1] - a[1])[0][0];
  const seen = new Uint8Array(info.width * info.height), queue = [];
  const enqueue = (x, y) => {
    if (x < 0 || y < 0 || x >= info.width || y >= info.height) return;
    const pixel = y * info.width + x;
    if (seen[pixel] || colorKey(pixel * 4) !== background) return;
    seen[pixel] = 1;
    queue.push(pixel);
  };
  for (let x = 0; x < info.width; x++) { enqueue(x, 0); enqueue(x, info.height - 1); }
  for (let y = 0; y < info.height; y++) { enqueue(0, y); enqueue(info.width - 1, y); }
  for (let index = 0; index < queue.length; index++) {
    const pixel = queue[index], x = pixel % info.width, y = Math.floor(pixel / info.width);
    data[pixel * 4 + 3] = 0;
    enqueue(x - 1, y); enqueue(x + 1, y); enqueue(x, y - 1); enqueue(x, y + 1);
  }
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toFile(target);
}
