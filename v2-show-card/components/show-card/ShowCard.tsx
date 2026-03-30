import * as React from 'react';

import { showCardThemes } from './show-card-themes';
import type { HostPlacement, ShowCardData, ShowCardLayout } from './types';

type ShowCardProps = {
  show: ShowCardData;
  layout?: ShowCardLayout;
  className?: string;
};

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

const layoutClasses: Record<ShowCardLayout, string> = {
  listing: 'min-h-[360px] aspect-[5/6] sm:aspect-[4/5]',
  featured: 'min-h-[360px] aspect-[16/10] md:min-h-[420px]',
  header: 'min-h-[360px] aspect-[16/9] md:min-h-[460px]'
};

const textWidthClasses: Record<ShowCardLayout, string> = {
  listing: 'max-w-[78%]',
  featured: 'max-w-[60%] sm:max-w-[56%]',
  header: 'max-w-[64%] sm:max-w-[54%]'
};

const hostPlacementClasses: Record<HostPlacement, string> = {
  center: 'left-1/2 -translate-x-1/2',
  'offset-left': 'left-[38%] -translate-x-1/2',
  'offset-right': 'left-[62%] -translate-x-1/2'
};

export function ShowCard({ show, layout = 'listing', className }: ShowCardProps) {
  const theme = showCardThemes[show.theme || 'default'];
  const hostPlacement = hostPlacementClasses[show.hostPlacement || 'center'];

  return (
    <article
      className={cx(
        'group relative isolate overflow-hidden rounded-[28px] border p-5 sm:p-6',
        'transition-transform duration-300 hover:-translate-y-1',
        theme.shell,
        layoutClasses[layout],
        className
      )}
    >
      <div className="absolute inset-0">
        {show.backgroundImageSrc ? (
          <img
            src={show.backgroundImageSrc}
            alt=""
            className="h-full w-full object-cover object-center"
          />
        ) : (
          <div className="h-full w-full bg-[linear-gradient(145deg,#0f2747_0%,#07111f_100%)]" />
        )}
      </div>

      <div className={cx('pointer-events-none absolute inset-0', theme.overlay)} />
      <div
        className={cx(
          'pointer-events-none absolute inset-0 before:absolute before:inset-0 before:content-[""] after:absolute after:inset-0 after:content-[""]',
          theme.glow
        )}
      />

      <div className="relative z-10 flex h-full flex-col justify-between">
        <div className={cx('space-y-4', textWidthClasses[layout])}>
          <div className="flex flex-wrap items-center gap-2">
            {show.daysLabel ? (
              <span className={cx('inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]', theme.badge)}>
                {show.daysLabel}
              </span>
            ) : null}
            {show.time ? (
              <span className="inline-flex rounded-full border border-white/15 bg-black/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80 backdrop-blur-sm">
                {show.time}
              </span>
            ) : null}
          </div>

          {show.logoSrc ? (
            <img
              src={show.logoSrc}
              alt="Radio Accent"
              className="h-8 w-auto object-contain opacity-95 sm:h-10"
            />
          ) : null}

          <div className="space-y-2">
            <h2 className={cx('text-balance text-[2rem] font-black uppercase leading-[0.9] tracking-[0.02em] sm:text-[2.5rem]', theme.title)}>
              {show.title}
            </h2>

            {show.subtitle ? (
              <p className={cx('max-w-[34ch] text-sm font-semibold uppercase tracking-[0.16em] sm:text-base', theme.accent)}>
                {show.subtitle}
              </p>
            ) : null}

            {show.tagline ? (
              <p className="max-w-[38ch] font-sans text-sm leading-6 text-white/88 sm:text-base">
                {show.tagline}
              </p>
            ) : null}
          </div>
        </div>

        <div className="relative z-10 mt-8 flex items-end justify-between gap-4">
          <div className="min-h-10" />

          {show.cta ? (
            <a
              href={show.cta.href}
              target={show.cta.target || '_self'}
              rel={show.cta.target === '_blank' ? 'noreferrer' : undefined}
              className={cx(
                'inline-flex items-center rounded-full border px-5 py-2.5 text-sm font-semibold tracking-[0.12em]',
                'uppercase backdrop-blur-sm transition-colors duration-200',
                theme.cta
              )}
            >
              {show.cta.label}
            </a>
          ) : null}
        </div>
      </div>

      {show.hostImageSrc ? (
        <div className={cx('pointer-events-none absolute bottom-0 z-[5] w-[62%] sm:w-[56%]', hostPlacement)}>
          <img
            src={show.hostImageSrc}
            alt={show.hostAlt || show.title}
            className="h-auto w-full object-contain object-bottom"
          />
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-[linear-gradient(180deg,rgba(2,6,23,0)_0%,rgba(2,6,23,0.18)_30%,rgba(2,6,23,0.56)_100%)]" />
    </article>
  );
}
