import { getHome } from "@/lib/catalog";
import { HeroCarousel } from "@/components/HeroCarousel";
import { HideForKids, KidsRows } from "@/components/ProfileMode";
import { PersonalRows } from "@/components/PersonalRows";
import { TitleRow } from "@/components/TitleRow";

export default async function Home() {
  const { hero, rows } = await getHome();

  // Up to five distinct featured titles with artwork: the ranked hero first, then the leading titles of the first rows.
  const seen = new Set<string>();
  const featured = [hero, ...rows.flatMap((r) => r.items.slice(0, 2))]
    .filter((t): t is NonNullable<typeof t> => !!t && !!t.backdrop && !seen.has(t.id) && !!seen.add(t.id))
    .slice(0, 5);

  return (
    <>
      {featured.length > 0 && (
        <HideForKids>
          <HeroCarousel titles={featured} />
        </HideForKids>
      )}

      <div className="relative space-y-4 pb-4">
        <KidsRows />
        <PersonalRows />
        <HideForKids>
          {rows.map((r) => (
            <TitleRow key={r.key} heading={r.title} titles={r.items} />
          ))}
        </HideForKids>
      </div>
    </>
  );
}
