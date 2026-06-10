import Link from "next/link";

export const metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <div
      style={{ minHeight: "100vh" }}
      className="mx-auto flex max-w-md flex-col items-center justify-center px-4 text-center"
    >
      <div className="brutal-card tilt-r p-8">
        <p className="font-display text-6xl font-bold">404</p>
        <h1 className="mt-3 font-display text-2xl font-bold">Nothing here.</h1>
        <p className="mt-2 text-sm text-ink/60">
          This page wandered off, or never existed. Happens to the best of us.
        </p>
        <Link
          href="/"
          className="brutal-press mt-5 inline-block border-3 border-ink bg-accent-blue px-4 py-2 font-display font-bold uppercase tracking-wide text-white no-underline shadow-brutal"
        >
          Back to home base
        </Link>
      </div>
    </div>
  );
}
