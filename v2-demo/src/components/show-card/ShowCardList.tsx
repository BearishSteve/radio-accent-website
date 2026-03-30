import { ShowCard } from './ShowCard.tsx';
import type { ShowCardData, ShowCardLayout } from './types.ts';

type ShowCardListProps = {
  shows: ShowCardData[];
  layout?: ShowCardLayout;
  className?: string;
};

const gridClassByLayout: Record<ShowCardLayout, string> = {
  listing: 'grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3',
  featured: 'grid grid-cols-1 gap-6',
  header: 'grid grid-cols-1 gap-6'
};

export function ShowCardList({ shows, layout = 'listing', className }: ShowCardListProps) {
  return (
    <section className={[gridClassByLayout[layout], className].filter(Boolean).join(' ')}>
      {shows.map((show) => (
        <ShowCard key={show.id} show={show} layout={layout} />
      ))}
    </section>
  );
}
