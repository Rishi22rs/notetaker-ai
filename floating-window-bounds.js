function clampFloatingBounds(bounds, area) {
  const width = Math.min(bounds.width, area.width);
  const height = Math.min(bounds.height, area.height);
  return {
    x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)),
    y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)),
    width, height
  };
}
function snapFloatingBounds(bounds, area, direction) {
  if (!['Left', 'Right', 'Up', 'Down'].includes(direction)) throw new Error('Invalid snap direction');
  const current = clampFloatingBounds(bounds, area);
  const horizontal = direction === 'Left' || direction === 'Right';
  const axis = horizontal ? 'x' : 'y';
  const size = horizontal ? 'width' : 'height';
  const start = area[axis];
  const end = start + area[size] - current[size];
  const positions = [start, Math.round((start + end) / 2), end];
  const forward = direction === 'Right' || direction === 'Down';
  const next = forward
    ? positions.find(position => position > current[axis] + 1) ?? end
    : [...positions].reverse().find(position => position < current[axis] - 1) ?? start;
  return { ...current, [axis]: next };
}
module.exports = { clampFloatingBounds, snapFloatingBounds };
