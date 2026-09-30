import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Button from './ui/Button';

export default function LanguageToggle() {
  const { t, i18n } = useTranslation();
  const isRu = i18n.language.startsWith('ru');

  function toggle() {
    const next = isRu ? 'en' : 'ru';
    i18n.changeLanguage(next);
    try {
      localStorage.setItem('ranger-language', next);
    } catch {
      // игнорируем — язык всё равно применится для текущей сессии
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={toggle}
      title={t('common.language') ?? ''}
      className="!flex !items-center !gap-1 !px-2 !py-1"
    >
      <Languages size={15} />
      <span className="font-mono text-xs">{isRu ? 'RU' : 'EN'}</span>
    </Button>
  );
}
