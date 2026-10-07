import { useTheme } from '@/lib/theme/theme-context';

import { cssColorAsRgb, type Rgb255 } from './css-color';
import { DotGrid, type DotColors } from './dot-grid';

const FALLBACK_BASE: Rgb255 = [128, 128, 128];

function themeDotColors(): DotColors {
  const base = cssColorAsRgb('--border') ?? FALLBACK_BASE;
  return { base, active: cssColorAsRgb('--primary') ?? base };
}

export default function AppDotGrid() {
  const { theme } = useTheme();
  return <DotGrid key={theme} readColors={themeDotColors} />;
}
