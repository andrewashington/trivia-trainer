import Link from "next/link";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

type ButtonVariant = "primary" | "danger" | "ghost" | "yellow" | "green";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-accent-blue text-white",
  danger: "bg-accent-red text-white",
  yellow: "bg-accent-yellow text-ink",
  green: "bg-accent-green text-ink",
  ghost: "bg-card text-ink",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={`brutal-press border-3 border-ink px-4 py-2 font-display font-bold uppercase tracking-wide shadow-brutal disabled:opacity-50 disabled:shadow-brutal disabled:translate-x-0 disabled:translate-y-0 ${variantClasses[variant]} ${className}`}
      {...props}
    />
  );
}

export function LinkButton({
  href,
  variant = "primary",
  className = "",
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`brutal-press inline-block border-3 border-ink px-4 py-2 font-display font-bold uppercase tracking-wide no-underline shadow-brutal ${variantClasses[variant]} ${className}`}
    >
      {children}
    </Link>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="brutal-input" {...props} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="brutal-input min-h-32" {...props} />;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="brutal-label">{label}</span>
      {children}
    </label>
  );
}

export function Card({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={`brutal-card p-4 ${className}`}>{children}</div>;
}

/** Big friendly module header with the module's accent color. */
export function PageHeader({
  title,
  accentBg,
  action,
}: {
  title: string;
  accentBg: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1
        className={`tilt-l inline-block border-3 border-ink px-4 py-1 text-3xl shadow-brutal ${accentBg}`}
      >
        {title}
      </h1>
      {action}
    </div>
  );
}

/** Sensible, playful empty states — required by the brief. */
export function EmptyState({ icon, title, hint }: { icon: string; title: string; hint?: string }) {
  return (
    <div className="brutal-card tilt-r mx-auto max-w-sm p-8 text-center">
      <div className="text-5xl">{icon}</div>
      <p className="mt-3 font-display text-xl font-bold">{title}</p>
      {hint && <p className="mt-1 text-sm text-ink/60">{hint}</p>}
    </div>
  );
}

const AVATAR_COLORS = [
  "bg-accent-blue text-white",
  "bg-accent-red text-white",
  "bg-accent-yellow text-ink",
  "bg-accent-green text-ink",
  "bg-accent-grape text-white",
];

/** Initials avatar with a deterministic accent color per person. */
export function Avatar({
  name,
  size = "md",
  title,
}: {
  name: string;
  size?: "sm" | "md";
  title?: string;
}) {
  let hash = 0;
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  const color = AVATAR_COLORS[hash % AVATAR_COLORS.length];
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const sizeClass = size === "sm" ? "h-7 w-7 text-xs" : "h-9 w-9 text-sm";
  return (
    <span
      title={title ?? name}
      className={`inline-flex items-center justify-center border-2 border-ink font-display font-bold ${color} ${sizeClass}`}
    >
      {initials}
    </span>
  );
}

export function Badge({
  children,
  className = "bg-paper",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-block border-2 border-ink px-2 py-0.5 font-mono text-xs font-bold uppercase ${className}`}
    >
      {children}
    </span>
  );
}
