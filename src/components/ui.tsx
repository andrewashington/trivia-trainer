import Link from "next/link";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { PixelIcon, type IconName } from "@/components/icons";
import { dicebearUrl } from "@/lib/avatar";

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
  icon,
  accentBg,
  action,
}: {
  title: string;
  icon?: IconName;
  accentBg: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1
        className={`tilt-l inline-flex items-center gap-2.5 border-3 border-ink px-4 py-1 text-3xl shadow-brutal ${accentBg}`}
      >
        {icon && <PixelIcon name={icon} size={26} />}
        {title}
      </h1>
      {action}
    </div>
  );
}

/** Sensible, playful empty states — required by the brief. */
export function EmptyState({ icon, title, hint }: { icon: IconName; title: string; hint?: string }) {
  return (
    <div className="brutal-card tilt-r mx-auto max-w-sm p-8 text-center">
      <div className="flex justify-center text-ink/70">
        <PixelIcon name={icon} size={48} />
      </div>
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

/**
 * DiceBear pixel-art avatar with a deterministic accent backdrop per
 * person. `src` (the user's chosen avatar) wins; otherwise the display
 * name seeds the art, so the same person looks the same everywhere.
 */
export function Avatar({
  name,
  src,
  size = "md",
  title,
}: {
  name: string;
  src?: string | null;
  size?: "sm" | "md" | "lg";
  title?: string;
}) {
  let hash = 0;
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  const color = AVATAR_COLORS[hash % AVATAR_COLORS.length];
  const sizeClass = size === "sm" ? "h-7 w-7" : size === "lg" ? "h-16 w-16" : "h-9 w-9";
  return (
    <span
      title={title ?? name}
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden border-2 border-ink ${color} ${sizeClass}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src || dicebearUrl(name)} alt={name} className="h-full w-full" />
    </span>
  );
}

/**
 * Avatar + name that click through to the person's profile. Use this
 * anywhere a member is shown so every face/name in the app is a door
 * to /people/[id].
 */
export function UserLink({
  userId,
  name,
  avatarUrl,
  size = "sm",
  label,
  className = "",
}: {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  size?: "sm" | "md" | "lg";
  label?: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={`/people/${userId}`}
      className={`inline-flex items-center gap-2 text-ink no-underline hover:text-accent-blue ${className}`}
    >
      <Avatar name={name} src={avatarUrl} size={size} />
      <span className="font-display font-bold">{label ?? name}</span>
    </Link>
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
