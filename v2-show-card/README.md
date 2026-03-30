# Radio Accent v2 Show Card System

Reusable React + Tailwind show cards for program listings, featured blocks and detail headers.

## Included

- `components/show-card/ShowCard.tsx`
  Base reusable show card.
- `components/show-card/FeaturedShowCard.tsx`
  Featured usage wrapper.
- `components/show-card/ShowHeaderCard.tsx`
  Detail-header usage wrapper.
- `components/show-card/ShowCardList.tsx`
  Data-driven list renderer.
- `components/show-card/show-card-themes.ts`
  Fixed branded theme variants.
- `components/show-card/types.ts`
  Shared TypeScript contracts.
- `data/shows.example.json`
  Example JSON config.

## Theme variants

- `default`
- `morning`
- `mix`
- `weekend`
- `retro`

Each variant keeps the same premium Radio Accent structure and swaps glow, accent and overlay balance only.

## Design rules implemented

- Background image fills the full card
- Dark gradient overlay keeps text readable
- Transparent PNG host sits in front of the background
- Host can be centered or slightly offset
- Text stays in a safe readable zone
- Rounded corners and subtle premium shadow
- Desktop and mobile layouts stay readable

## Example usage

```tsx
import shows from '@/v2-show-card/data/shows.example.json';
import { FeaturedShowCard, ShowCardList, ShowHeaderCard } from '@/v2-show-card/components/show-card';

export function ProgramsPage() {
  return <ShowCardList shows={shows} />;
}

export function HomeFeatured() {
  return <FeaturedShowCard show={shows[0]} />;
}

export function ShowDetailHeader() {
  return <ShowHeaderCard show={shows[1]} />;
}
```

## JSON-driven rendering

The component accepts plain data objects matching `ShowCardData`. Importing JSON works as long as the React app already supports JSON imports.

## Asset expectations

Prepare these folders in the v2 app:

- `public/assets/show-backgrounds/`
- `public/assets/show-hosts/`

Host images should be transparent PNGs. Backgrounds should be wide enough for full-card cover rendering.
