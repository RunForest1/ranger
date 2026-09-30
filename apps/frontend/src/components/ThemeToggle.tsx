import { Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../stores/ui.store';

// Переключатель-тумблер, а не текстовая кнопка — солнце/луна показывают текущую
// тему сами по себе, но подпись остаётся в title для доступности (раздел 6 CLAUDE.md:
// статус не должен полагаться только на цвет/иконку без текстового пояснения).
export default function ThemeToggle() {
  const { t } = useTranslation();
  const { theme, setTheme } = useUiStore();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      title={isDark ? t('common.theme.light') : t('common.theme.dark')}
      aria-label={isDark ? t('common.theme.light') : t('common.theme.dark')}
      className="relative flex h-7 w-14 items-center rounded-full border border-border bg-surface-alt px-1 transition-colors"
    >
      <Sun size={13} className="absolute left-1.5 text-muted" />
      <Moon size={13} className="absolute right-1.5 text-muted" />
      <span
        className={`z-10 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-accent-contrast transition-transform duration-150 ${
          isDark ? 'translate-x-7' : 'translate-x-0'
        }`}
      >
        {isDark ? <Moon size={12} /> : <Sun size={12} />}
      </span>
    </button>
  );
}
