import { useTranslation } from "react-i18next";
import skLogo from "#/assets/branding/sk-logo.png";
import { NavigationLink } from "#/components/shared/navigation-link";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";

const DEFAULT_LOGO_WIDTH = 46;
const DEFAULT_LOGO_HEIGHT = 30;

export type OpenHandsLogoButtonProps = {
  className?: string;
  /** Applied to the root `<svg>` (e.g. `max-w-none` so Tailwind preflight doesn’t clamp wide marks inside a narrow flex slot). */
  logoClassName?: string;
  logoWidth?: number;
  logoHeight?: number;
  /** Show the skillsdog.com wordmark to the right of the logo. */
  showWordmark?: boolean;
};

export function OpenHandsLogoButton({
  className,
  logoClassName,
  logoWidth = DEFAULT_LOGO_WIDTH,
  logoHeight = DEFAULT_LOGO_HEIGHT,
  showWordmark = true,
}: OpenHandsLogoButtonProps = {}) {
  const { t } = useTranslation("openhands");

  const ariaLabel = t(I18nKey.BRANDING$OPENHANDS_LOGO);
  const wordmark = t(I18nKey.BRANDING$SITE);

  return (
    <NavigationLink
      to="/conversations"
      aria-label={ariaLabel}
      className={cn("inline-flex min-w-0 items-center gap-2", className)}
    >
      <img
        src={skLogo}
        width={logoWidth}
        height={logoHeight}
        alt=""
        className={cn("shrink-0 object-contain", logoClassName)}
      />
      {showWordmark ? (
        <span className="truncate text-sm font-medium tracking-tight text-white">
          {wordmark}
        </span>
      ) : null}
    </NavigationLink>
  );
}
