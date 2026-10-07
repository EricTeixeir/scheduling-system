import { useMediaQuery } from '@/hooks/use-media-query';
import { useTheme } from '@/lib/theme/theme-context';

import { cssColorAsRgb } from './css-color';
import { Galaxy, type Rgb } from './galaxy';

function primaryColorAsRgb(): Rgb {
  const [red, green, blue] = cssColorAsRgb('--primary') ?? [255, 255, 255];
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
