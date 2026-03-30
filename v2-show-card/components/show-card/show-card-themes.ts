import type { ShowCardTheme } from './types';

export type ShowCardThemeTokens = {
  shell: string;
  overlay: string;
  glow: string;
  badge: string;
  title: string;
  accent: string;
  cta: string;
};

export const showCardThemes: Record<ShowCardTheme, ShowCardThemeTokens> = {
  default: {
    shell: 'border-cyan-400/20 bg-slate-950 shadow-[0_22px_55px_rgba(5,12,24,0.45)]',
    overlay: 'bg-[linear-gradient(180deg,rgba(4,11,23,0.08)_0%,rgba(4,11,23,0.42)_36%,rgba(3,10,20,0.94)_100%)]',
    glow: 'before:bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.28),transparent_42%)] after:bg-[radial-gradient(circle_at_bottom_left,rgba(34,211,238,0.2),transparent_38%)]',
    badge: 'border-cyan-300/25 bg-cyan-400/10 text-cyan-100',
    title: 'text-white',
    accent: 'text-cyan-200',
    cta: 'border-cyan-300/35 bg-cyan-300/10 text-cyan-50 hover:bg-cyan-300/20'
  },
  morning: {
    shell: 'border-sky-300/20 bg-slate-950 shadow-[0_22px_55px_rgba(9,16,31,0.45)]',
    overlay: 'bg-[linear-gradient(180deg,rgba(15,23,42,0.1)_0%,rgba(9,17,34,0.46)_34%,rgba(6,14,28,0.94)_100%)]',
    glow: 'before:bg-[radial-gradient(circle_at_top_right,rgba(125,211,252,0.28),transparent_42%)] after:bg-[radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.22),transparent_40%)]',
    badge: 'border-sky-200/25 bg-sky-300/10 text-sky-50',
    title: 'text-white',
    accent: 'text-sky-100',
    cta: 'border-sky-200/35 bg-sky-200/10 text-sky-50 hover:bg-sky-200/20'
  },
  mix: {
    shell: 'border-blue-300/20 bg-slate-950 shadow-[0_22px_55px_rgba(7,12,24,0.55)]',
    overlay: 'bg-[linear-gradient(180deg,rgba(9,11,25,0.04)_0%,rgba(10,12,26,0.44)_32%,rgba(6,8,18,0.96)_100%)]',
    glow: 'before:bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.26),transparent_42%)] after:bg-[radial-gradient(circle_at_bottom_left,rgba(37,99,235,0.25),transparent_40%)]',
    badge: 'border-blue-200/25 bg-blue-300/10 text-blue-50',
    title: 'text-white',
    accent: 'text-cyan-100',
    cta: 'border-cyan-300/35 bg-cyan-300/10 text-cyan-50 hover:bg-cyan-300/20'
  },
  weekend: {
    shell: 'border-fuchsia-300/20 bg-slate-950 shadow-[0_22px_55px_rgba(17,9,31,0.52)]',
    overlay: 'bg-[linear-gradient(180deg,rgba(14,8,24,0.08)_0%,rgba(18,9,31,0.46)_34%,rgba(8,8,18,0.95)_100%)]',
    glow: 'before:bg-[radial-gradient(circle_at_top_right,rgba(244,114,182,0.24),transparent_42%)] after:bg-[radial-gradient(circle_at_bottom_left,rgba(34,211,238,0.22),transparent_40%)]',
    badge: 'border-fuchsia-200/25 bg-fuchsia-300/10 text-fuchsia-50',
    title: 'text-white',
    accent: 'text-fuchsia-100',
    cta: 'border-fuchsia-200/35 bg-fuchsia-200/10 text-fuchsia-50 hover:bg-fuchsia-200/20'
  },
  retro: {
    shell: 'border-amber-200/20 bg-slate-950 shadow-[0_22px_55px_rgba(27,17,6,0.48)]',
    overlay: 'bg-[linear-gradient(180deg,rgba(20,16,10,0.1)_0%,rgba(17,14,10,0.48)_34%,rgba(8,8,10,0.96)_100%)]',
    glow: 'before:bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.2),transparent_40%)] after:bg-[radial-gradient(circle_at_bottom_left,rgba(251,191,36,0.2),transparent_38%)]',
    badge: 'border-amber-200/25 bg-amber-200/10 text-amber-50',
    title: 'text-white',
    accent: 'text-amber-100',
    cta: 'border-amber-200/35 bg-amber-200/10 text-amber-50 hover:bg-amber-200/20'
  }
};
