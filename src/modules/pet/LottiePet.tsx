"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { animationFor, type PetFace } from "./animations";

// lottie-react touches the DOM at import time — keep it out of SSR.
const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

/**
 * The pet's animated face: a hand-authored Lottie loop per mood bucket.
 * Honors prefers-reduced-motion by freezing on the first frame.
 */
export function LottiePet({ face, size = 200 }: { face: PetFace; size?: number }) {
  const [mounted, setMounted] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  if (!mounted) {
    // Reserve the box so the habitat doesn't jump while Lottie loads.
    return <div style={{ width: size, height: size }} aria-hidden />;
  }

  return (
    <Lottie
      key={face}
      animationData={animationFor(face)}
      loop={!reduced}
      autoplay={!reduced}
      style={{ width: size, height: size }}
      aria-hidden
    />
  );
}
