"use client";

import { motion, useReducedMotion, type Variants } from "motion/react";
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

// Shared brutalist-snappy variants: items pop in with a low-damping spring.
export const staggerContainer = (stagger = 0.07): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger } },
});

export const popItem: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.96 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring", stiffness: 500, damping: 18 },
  },
};

const noMotion: Variants = { hidden: {}, show: {} };

type StaggerListProps<T extends ElementType> = {
  as?: T;
  stagger?: number;
  children: ReactNode;
  className?: string;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "children" | "className">;

/**
 * Animates its children in one-by-one on mount with a snappy spring pop.
 * Wrap list items in <StaggerItem> (defaults to <li>). Server data flows
 * straight through — only the wrapper is a client component.
 */
export function StaggerList<T extends ElementType = "ul">({
  as,
  stagger = 0.07,
  children,
  className,
  ...rest
}: StaggerListProps<T>) {
  const reduced = useReducedMotion();
  const Tag = (motion as Record<string, any>)[(as as string) ?? "ul"];
  return (
    <Tag
      className={className}
      variants={reduced ? noMotion : staggerContainer(stagger)}
      initial="hidden"
      animate="show"
      {...rest}
    >
      {children}
    </Tag>
  );
}

type StaggerItemProps<T extends ElementType> = {
  as?: T;
  children: ReactNode;
  className?: string;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "children" | "className">;

export function StaggerItem<T extends ElementType = "li">({
  as,
  children,
  className,
  ...rest
}: StaggerItemProps<T>) {
  const reduced = useReducedMotion();
  const Tag = (motion as Record<string, any>)[(as as string) ?? "li"];
  return (
    <Tag className={className} variants={reduced ? noMotion : popItem} {...rest}>
      {children}
    </Tag>
  );
}
