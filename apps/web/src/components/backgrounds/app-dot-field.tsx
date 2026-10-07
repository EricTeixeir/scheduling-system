import { useTheme } from '@/lib/theme/theme-context';

import { cssColorAsRgb, type Rgb255 } from './css-color';
import { DotField, type DotFieldColors } from './dot-field';

const FALLBACK: Rgb255 = [128, 128, 128];

function themeDotColors(): DotFieldColors {
  const base = cssColorAsRgb('--muted-foreground') ?? FALLBACK;
  return { accent: cssColorAsRgb('--primary') ?? base, base };
}

export default function AppDotField() {
  const { theme } = useTheme();
  return <DotField key={theme} readColors={themeDotColors} />;
}
