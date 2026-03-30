export type ShowCardTheme = 'default' | 'morning' | 'mix' | 'weekend' | 'retro';

export type ShowCardLayout = 'listing' | 'featured' | 'header';

export type HostPlacement = 'center' | 'offset-left' | 'offset-right';

export type ShowCta = {
  href: string;
  label: string;
  target?: '_self' | '_blank';
};

export type ShowCardData = {
  id: string;
  title: string;
  subtitle?: string;
  tagline?: string;
  daysLabel?: string;
  time?: string;
  logoSrc?: string;
  backgroundImageSrc?: string;
  hostImageSrc?: string;
  hostPlacement?: HostPlacement;
  hostAlt?: string;
  cta?: ShowCta;
  theme?: ShowCardTheme;
};
