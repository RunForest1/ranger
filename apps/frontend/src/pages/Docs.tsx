import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';

const TAB_KEYS = ['overview', 'quickstart', 'build', 'users', 'security', 'roadmap'] as const;
type TabKey = (typeof TAB_KEYS)[number];

interface DocStep {
  title: string;
  body: string;
}

function StepList({ steps }: { steps: DocStep[] }) {
  return (
    <ol className="space-y-3">
      {steps.map((step, i) => (
        <li key={i} className="flex gap-3">
          <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-accent-soft font-mono text-xs text-accent">
            {i + 1}
          </span>
          <div>
            <p className="text-sm font-medium text-primary">{step.title}</p>
            <p className="mt-0.5 whitespace-pre-line text-sm leading-relaxed text-muted">{step.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function Docs() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabKey>('overview');
  const tabs = t('docs.tabs', { returnObjects: true }) as Record<TabKey, string>;

  const hasSteps = tab === 'quickstart' || tab === 'users';

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-primary">{t('docs.title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('docs.intro')}</p>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-border pb-3">
        {TAB_KEYS.map((key) => (
          <Button
            key={key}
            type="button"
            variant={tab === key ? 'secondary' : 'ghost'}
            onClick={() => setTab(key)}
            className="!px-2.5 !py-1 text-xs"
          >
            {tabs[key]}
          </Button>
        ))}
      </div>

      <Card className="p-5">
        {hasSteps ? (
          <>
            <p className="mb-4 text-sm text-muted">{t(`docs.${tab}.intro`)}</p>
            <StepList steps={t(`docs.${tab}.steps`, { returnObjects: true }) as DocStep[]} />
          </>
        ) : (
          <p className="whitespace-pre-line text-sm leading-relaxed text-muted">{t(`docs.${tab}.body`)}</p>
        )}
      </Card>
    </div>
  );
}
