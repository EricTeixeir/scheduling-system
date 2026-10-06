import { useMediaQuery } from '@/hooks/use-media-query';
import { useTheme } from '@/lib/theme/theme-context';

import { Galaxy, type Rgb } from './galaxy';

const WHITE: Rgb = [1, 1, 1];

function primaryColorAsRgb(): Rgb {
  const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!context) return WHITE;
  context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--primary');
  context.fillRect(0, 0, 1, 1);
  const [red = 255, green = 255, blue = 255] = context.getImageData(0, 0, 1, 1).data;
  return [red / 255, green / 255, blue / 255];
}

export default function LoginGalaxy() {
  const { theme } = useTheme();
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const finePointer = useMediaQuery('(pointer: fine)');

  return (
    // Remount per theme: Galaxy reads --primary in a passive effect, after ThemeProvider's layout
    // effect has switched the theme class.
    <Galaxy
      key={theme}
      readStarColor={primaryColorAsRgb}
      animated={!reducedMotion}
      interactive={finePointer && !reducedMotion}
    />
  );
}
