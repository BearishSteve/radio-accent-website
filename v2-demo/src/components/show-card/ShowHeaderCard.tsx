import { ShowCard } from './ShowCard.tsx';
import type { ShowCardData } from './types.ts';

type ShowHeaderCardProps = {
  show: ShowCardData;
  className?: string;
};

export function ShowHeaderCard({ show, className }: ShowHeaderCardProps) {
  return <ShowCard show={show} layout="header" className={className} />;
}
