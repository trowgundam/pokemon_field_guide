export const worldViewport = ({ viewportWidth, viewportHeight, scale, translateX, translateY }) => ({
    left: -translateX / scale,
    top: -translateY / scale,
    width: viewportWidth / scale,
    height: viewportHeight / scale
});

export const intersectsExpandedViewport = (layer, viewport, marginFactor) => {
    const horizontalMargin = viewport.width * marginFactor;
    const verticalMargin = viewport.height * marginFactor;
    return layer.x + layer.width >= viewport.left - horizontalMargin
        && layer.x <= viewport.left + viewport.width + horizontalMargin
        && layer.y + layer.height >= viewport.top - verticalMargin
        && layer.y <= viewport.top + viewport.height + verticalMargin;
};

export const layerResidency = (layer, viewport, scale, loaded) => {
    if (scale < layer.minScale) return 'evict';
    if (!loaded && intersectsExpandedViewport(layer, viewport, 1)) return 'load';
    if (loaded && intersectsExpandedViewport(layer, viewport, 2)) return 'retain';
    return loaded ? 'evict' : 'idle';
};

export const applyLayerDecision = (queue, layer, decision) => {
    if (decision === 'load') {
        queue.add(layer);
        return false;
    }
    queue.delete(layer);
    return decision === 'evict';
};
