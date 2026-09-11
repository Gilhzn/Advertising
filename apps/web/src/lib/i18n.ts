/**
 * Tiny UI-string dictionary. This is the *dashboard chrome* language (`ui_lang` cookie),
 * independent from a business's content language(s).
 */
export const UI_LANGS = ["en", "he"] as const;
export type UiLang = (typeof UI_LANGS)[number];

const dict = {
  en: {
    nav_overview: "Overview",
    nav_strategy: "Strategy",
    nav_setup: "Setup",
    nav_content: "Content",
    nav_platforms: "Platforms",
    nav_analytics: "Analytics",
    nav_product: "Product",
    nav_insights: "Insights",
    nav_mail: "Mail",
    nav_settings: "Settings",
    nav_new_business: "New business",
    nav_all_businesses: "All businesses",
    nav_app_settings: "App settings",
    nav_sign_out: "Sign out",
    action_approve: "Approve",
    action_reject: "Reject",
    action_edit: "Edit",
    action_reschedule: "Reschedule",
    action_publish_now: "Publish now",
    action_rerun: "Re-run",
    action_save: "Save",
    action_cancel: "Cancel",
    action_delete: "Delete",
    action_connect: "Connect",
    action_disconnect: "Disconnect",
    action_bulk_approve: "Approve selected",
    action_generate_week: "Generate next 7 days",
    action_create: "Create business",
    action_dismiss: "Dismiss",
    action_accept: "Accept",
    status_awaiting_approval: "Awaiting approval",
    empty_default: "Nothing here yet.",
    loading: "Loading…",
    language: "Language",
  },
  he: {
    nav_overview: "סקירה כללית",
    nav_strategy: "אסטרטגיה",
    nav_setup: "הגדרה",
    nav_content: "תוכן",
    nav_platforms: "פלטפורמות",
    nav_analytics: "אנליטיקה",
    nav_product: "מוצר",
    nav_insights: "תובנות",
    nav_mail: "דואר",
    nav_settings: "הגדרות",
    nav_new_business: "עסק חדש",
    nav_all_businesses: "כל העסקים",
    nav_app_settings: "הגדרות מערכת",
    nav_sign_out: "התנתקות",
    action_approve: "אישור",
    action_reject: "דחייה",
    action_edit: "עריכה",
    action_reschedule: "תזמון מחדש",
    action_publish_now: "פרסם עכשיו",
    action_rerun: "הרצה מחדש",
    action_save: "שמירה",
    action_cancel: "ביטול",
    action_delete: "מחיקה",
    action_connect: "חיבור",
    action_disconnect: "ניתוק",
    action_bulk_approve: "אישור הנבחרים",
    action_generate_week: "צור 7 ימים קדימה",
    action_create: "צור עסק",
    action_dismiss: "התעלם",
    action_accept: "קבל",
    status_awaiting_approval: "ממתין לאישור",
    empty_default: "אין עדיין נתונים.",
    loading: "טוען…",
    language: "שפה",
  },
} as const;

export type DictKey = keyof (typeof dict)["en"];

export function t(key: DictKey, lang: UiLang = "en"): string {
  return dict[lang]?.[key] ?? dict.en[key] ?? key;
}

export function dirFor(lang: UiLang): "ltr" | "rtl" {
  return lang === "he" ? "rtl" : "ltr";
}
