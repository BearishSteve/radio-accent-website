import shows from './data/shows.json';
import { FeaturedShowCard, ShowCardList, ShowHeaderCard } from './components/show-card/index.ts';
import type { ShowCardData, ShowCardTheme } from './components/show-card/types.ts';

const themeBackgrounds: Record<ShowCardTheme, string> = {
  default: '/demo-assets/background-default.svg',
  morning: '/demo-assets/background-morning.svg',
  mix: '/demo-assets/background-mix.svg',
  weekend: '/demo-assets/background-weekend.svg',
  retro: '/demo-assets/background-retro.svg'
};

const hostImages: Record<string, string> = {
  'accent-ochtend': '/demo-assets/host-ochtend.svg',
  frequencies: '/demo-assets/host-dj.svg',
  'accent-weekend': '/demo-assets/host-weekend.svg'
};

const logoSrc = '/demo-assets/radio-accent-wordmark.svg';

const demoShows: ShowCardData[] = (shows as ShowCardData[]).map((show) => ({
  ...show,
  logoSrc,
  backgroundImageSrc: themeBackgrounds[show.theme || 'default'],
  hostImageSrc: hostImages[show.id] || '/demo-assets/host-default.svg'
}));

const featuredShow = demoShows[1];
const headerShow = {
  ...demoShows[0],
  title: 'Accent Ochtend',
  subtitle: 'Warm in, scherp uit de speakers',
  tagline:
    'Een premium morning-show header voor detailpagina’s, met voldoende ruimte voor branding, host en CTA.'
};

export default function App() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#163a67_0%,#0a1424_44%,#040811_100%)] text-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-12 px-4 py-8 sm:px-6 lg:px-8">
        <section className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200/80">
            Radio Accent v2
          </p>
          <div className="max-w-3xl space-y-4">
            <h1 className="text-balance text-4xl font-black uppercase tracking-[0.02em] text-white sm:text-5xl">
              Reusable show-card demo
            </h1>
            <p className="max-w-2xl font-sans text-base leading-7 text-slate-200/88">
              This demo shows one branded system reused for featured shows, program grids and
              detail headers. Background variants stay fixed, host PNG layers stay independent,
              and all content can be rendered from plain JSON data.
            </p>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/75">
                Header usage
              </p>
              <h2 className="text-2xl font-black uppercase tracking-[0.02em] text-white">
                Show detail hero
              </h2>
            </div>
          </div>
          <ShowHeaderCard show={headerShow} />
        </section>

        <section className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/75">
              Featured usage
            </p>
            <h2 className="text-2xl font-black uppercase tracking-[0.02em] text-white">
              Home spotlight
            </h2>
          </div>
          <FeaturedShowCard show={featuredShow} />
        </section>

        <section className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/75">
              Listing usage
            </p>
            <h2 className="text-2xl font-black uppercase tracking-[0.02em] text-white">
              Program grid
            </h2>
          </div>
          <ShowCardList shows={demoShows} />
        </section>
      </div>
    </main>
  );
}
