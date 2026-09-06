/**
 * Thin typed wrapper over the official Telegram WebApp API (loaded by the
 * script tag in index.html). Every call degrades to a no-op in a plain browser
 * so the app can be developed and screenshotted outside Telegram.
 */
export interface ThemeParams {
  bg_color?: string;
  secondary_bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  section_bg_color?: string;
  header_bg_color?: string;
}

interface WebApp {
  initData: string;
  colorScheme: 'light' | 'dark';
  themeParams: ThemeParams;
  ready(): void;
  expand(): void;
  onEvent(event: string, handler: () => void): void;
  offEvent(event: string, handler: () => void): void;
  HapticFeedback?: { impactOccurred(style: string): void; notificationOccurred(type: string): void };
  BackButton?: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: WebApp };
  }
}

export const webApp = (): WebApp | undefined => window.Telegram?.WebApp;

/** True when running inside a real Telegram client (initData is signed there). */
export const isInsideTelegram = (): boolean => Boolean(webApp()?.initData);

export function initTelegram() {
  const app = webApp();
  app?.ready();
  app?.expand();
}

export function haptic(style: 'light' | 'medium' = 'light') {
  webApp()?.HapticFeedback?.impactOccurred(style);
}

const CSS_VARS: Record<keyof ThemeParams, string> = {
  bg_color: '--tg-bg',
  secondary_bg_color: '--tg-bg-secondary',
  section_bg_color: '--tg-section-bg',
  header_bg_color: '--tg-header-bg',
  text_color: '--tg-text',
  hint_color: '--tg-hint',
  link_color: '--tg-link',
  button_color: '--tg-button',
  button_text_color: '--tg-button-text',
};

/**
 * Mirrors Telegram's themeParams onto CSS variables. Outside Telegram nothing
 * is written and theme.css keeps its prefers-color-scheme defaults.
 */
export function applyTheme() {
  const app = webApp();
  if (!app) return;
  const root = document.documentElement;
  for (const [key, cssVar] of Object.entries(CSS_VARS)) {
    const value = app.themeParams[key as keyof ThemeParams];
    if (value) root.style.setProperty(cssVar, value);
  }
  root.dataset.theme = app.colorScheme;
}

/** Re-applies the palette whenever the user switches theme inside Telegram. */
export function watchTheme(): () => void {
  const app = webApp();
  if (!app) return () => {};
  applyTheme();
  app.onEvent('themeChanged', applyTheme);
  return () => app.offEvent('themeChanged', applyTheme);
}
