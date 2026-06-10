import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { OptionArt } from "@/modules/thekey/art";
import { OPTION_TITLES } from "@/modules/thekey/schema";

export const metadata = { title: "The Key — art proofs" };

/** Dev proof sheet: every reference diagram at full size. */
export default async function KeyArtGalleryPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  return (
    <div className="space-y-8">
      <h1 className="tilt-l inline-block border-3 border-ink bg-accent-eggplant px-4 py-1 text-3xl text-white shadow-brutal">
        Art proofs
      </h1>
      {(Object.keys(OPTION_TITLES) as (keyof typeof OPTION_TITLES)[]).map((field) => (
        <section key={field}>
          <h2 className="brutal-label">{field}</h2>
          <div className="flex flex-wrap gap-3">
            {Object.entries(OPTION_TITLES[field]).map(([value, title]) => (
              <figure
                key={value}
                className="brutal-card flex w-40 flex-col items-center gap-2 p-3"
              >
                <span className="[&_svg]:h-48 [&_svg]:w-32">
                  <OptionArt field={field} value={value} />
                </span>
                <figcaption className="text-center text-xs font-bold">{title}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
