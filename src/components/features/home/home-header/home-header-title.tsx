import { useTranslation } from "react-i18next";
import { Typography } from "#/ui/typography";
import { I18nKey } from "#/i18n/declaration";

export function HomeHeaderTitle() {
  const { t } = useTranslation("openhands");

  return (
    <div className="flex w-full items-center justify-center py-2 md:py-3">
      <Typography.H1 className="w-full text-center text-[2.125rem] font-semibold leading-[1.12] tracking-[-0.03em]">
        {t(I18nKey.HOME$LETS_START_BUILDING)}
      </Typography.H1>
    </div>
  );
}
