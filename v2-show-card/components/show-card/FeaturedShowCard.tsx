import * as React from 'react';

import { ShowCard } from './ShowCard';
import type { ShowCardData } from './types';

type FeaturedShowCardProps = {
  show: ShowCardData;
  className?: string;
};

export function FeaturedShowCard({ show, className }: FeaturedShowCardProps) {
  return <ShowCard show={show} layout="featured" className={className} />;
}
