import * as React from 'react';

import { ShowCard } from './ShowCard';
import type { ShowCardData } from './types';

type ShowHeaderCardProps = {
  show: ShowCardData;
  className?: string;
};

export function ShowHeaderCard({ show, className }: ShowHeaderCardProps) {
  return <ShowCard show={show} layout="header" className={className} />;
}
