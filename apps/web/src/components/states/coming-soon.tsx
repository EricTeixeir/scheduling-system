import type { LucideIcon } from 'lucide-react';

import { StatusMessage } from './status-message';

interface ComingSoonProps {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly description: string;
}

export function ComingSoon({ icon, title, description }: ComingSoonProps) {
  return <StatusMessage icon={icon} badge="Em breve" title={title} description={description} />;
}
