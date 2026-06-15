import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { PixelIcon } from "@/components/icons";
import type { Dossier } from "../insights";

/** Renders the LLM-authored personality dossier (markdown) for an author. */
export function DossierCard({ dossier }: { dossier: Dossier }) {
  return (
    <div className="brutal-card border-accent-blurple p-5">
      <div className="mb-2 flex items-center gap-2 text-accent-blurple">
        <PixelIcon name="robot-face-happy" size={16} />
        <span className="brutal-label">The Dossier</span>
      </div>
      <div className="prose-brutal [&_em]:text-ink/70 [&_h2]:mt-3 [&_h2]:text-lg [&_h3]:mt-3 [&_h3]:text-base [&_li]:my-0.5 [&_p]:my-2 [&_strong]:text-accent-blurple [&_ul]:list-disc [&_ul]:pl-5">
        <Markdown remarkPlugins={[remarkGfm, remarkBreaks]}>{dossier.body}</Markdown>
      </div>
      <p className="mt-3 font-mono text-[10px] uppercase text-ink/40">
        Auto-generated from the archive. Not legally binding.
      </p>
    </div>
  );
}
