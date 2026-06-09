/**
 * The module registry: each feature plugs into the shell here.
 * Adding a module = create its folder under src/modules + src/app
 * routes, then append one entry. No edits to existing modules.
 */
export type ModuleDef = {
  key: string;
  label: string;
  /** Emoji works as a chunky brutalist icon and needs no asset pipeline. */
  icon: string;
  navOrder: number;
  href: string;
  /** Tailwind class for the module's accent surface (nav + headers). */
  accentBg: string;
};

export const modules: ModuleDef[] = [
  {
    key: "cookbook",
    label: "Cookbook",
    icon: "🍳",
    navOrder: 1,
    href: "/cookbook",
    accentBg: "bg-accent-red",
  },
  {
    key: "events",
    label: "Events",
    icon: "📅",
    navOrder: 2,
    href: "/events",
    accentBg: "bg-accent-blue",
  },
  {
    key: "nowplaying",
    label: "Now Playing",
    icon: "📺",
    navOrder: 3,
    href: "/nowplaying",
    accentBg: "bg-accent-yellow",
  },
  {
    key: "files",
    label: "Files",
    icon: "📦",
    navOrder: 4,
    href: "/files",
    accentBg: "bg-accent-green",
  },
  {
    key: "wishlist",
    label: "Wishlist",
    icon: "🎁",
    navOrder: 5,
    href: "/wishlist",
    accentBg: "bg-accent-orange",
  },
  {
    key: "contacts",
    label: "People",
    icon: "📇",
    navOrder: 6,
    href: "/contacts",
    accentBg: "bg-accent-pink",
  },
  {
    key: "vault",
    label: "Vault",
    icon: "🔐",
    navOrder: 7,
    href: "/vault",
    accentBg: "bg-accent-cyan",
  },
  {
    key: "map",
    label: "Map",
    icon: "🗺️",
    navOrder: 8,
    href: "/map",
    accentBg: "bg-accent-teal",
  },
  {
    key: "ideas",
    label: "Ideas",
    icon: "💡",
    navOrder: 9,
    href: "/ideas",
    accentBg: "bg-accent-lime",
  },
  {
    key: "marketplace",
    label: "Market",
    icon: "🏷️",
    navOrder: 10,
    href: "/marketplace",
    accentBg: "bg-accent-magenta",
  },
];

export function sortedModules(): ModuleDef[] {
  return [...modules].sort((a, b) => a.navOrder - b.navOrder);
}
