export type Rgb255 = readonly [number, number, number];

export function cssColorAsRgb(customProperty: string): Rgb255 | null {
  const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(customProperty);
  context.fillRect(0, 0, 1, 1);
  const [red = 0, green = 0, blue = 0] = context.getImageData(0, 0, 1, 1).data;
  return [red, green, blue];
}
