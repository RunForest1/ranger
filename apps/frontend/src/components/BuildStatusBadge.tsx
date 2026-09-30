import { useTranslation } from 'react-i18next';
import type { BuildStatus } from '../types';
import Badge, { BadgeTone } from './ui/Badge';

const STATUS_TONE: Record<BuildStatus, BadgeTone> = {
  queued: 'muted',
  running: 'accent',
  success: 'success',
  failed: 'danger',
  rolled_back: 'warning',
};

export default function BuildStatusBadge({ status }: { status: BuildStatus }) {
  const { t } = useTranslation();
  return <Badge tone={STATUS_TONE[status]}>{t(`builds.status.${status}`)}</Badge>;
}
