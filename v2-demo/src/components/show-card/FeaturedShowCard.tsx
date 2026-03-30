import { ShowCard } from './ShowCard.tsx';
import type { ShowCardData } from './types.ts';

type FeaturedShowCardProps = {
  show: ShowCardData;
  className?: string;
};

export function FeaturedShowCard({ show, className }: FeaturedShowCardProps) {
  return <ShowCard show={show} layout="featured" className={className} />;
}
