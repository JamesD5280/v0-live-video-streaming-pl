"use client"

import { Button } from "@/components/ui/button"
import { useLanguage } from "@/components/language-provider"

export function LanguageToggle() {
  const { locale, setLocale, t } = useLanguage()
  const nextLocale = locale === "en" ? "fr" : "en"

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={t(nextLocale === "fr" ? "Switch language to French" : "Switch language to English")}
      title={t(nextLocale === "fr" ? "Switch language to French" : "Switch language to English")}
      onClick={() => setLocale(nextLocale)}
      className="h-8 min-w-9 px-2 text-xs font-semibold"
    >
      {nextLocale.toUpperCase()}
    </Button>
  )
}
