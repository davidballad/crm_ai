import { Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * Full-page gate shown when a feature requires a Pro plan.
 * @param {string} featureKey - i18n key suffix, e.g. "aiInsights" or "leads"
 */
export default function UpgradeWall({ featureKey = 'feature' }) {
  const { t } = useTranslation();
  return (
    <div className="card flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50">
        <Lock className="h-7 w-7 text-brand-500" />
      </div>
      <h2 className="text-lg font-semibold text-gray-900">{t('upgrade.title')}</h2>
      <p className="mt-2 max-w-sm text-sm text-gray-500">
        {t(`upgrade.${featureKey}Desc`)}
      </p>
      <a
        href="mailto:hello@clienta.ai"
        className="btn-primary mt-6"
      >
        {t('upgrade.cta')}
      </a>
    </div>
  );
}
