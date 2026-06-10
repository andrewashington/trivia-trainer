import type { PetMood } from "../engine";
import { happyAnimation } from "./happy";
import { idleAnimation } from "./idle";
import { sadAnimation } from "./sad";
import { ecstaticAnimation } from "./ecstatic";

export { happyAnimation, idleAnimation, sadAnimation, ecstaticAnimation };

/** A face for every state the stage can show — moods plus the pat burst. */
export type PetFace = PetMood | "ecstatic";

/** Five moods fold into three looping faces; "ecstatic" is the pat reaction. */
export function animationFor(face: PetFace): object {
  switch (face) {
    case "ecstatic":
      return ecstaticAnimation;
    case "thriving":
    case "happy":
      return happyAnimation;
    case "okay":
    case "sleepy":
      return idleAnimation;
    case "sad":
      return sadAnimation;
  }
}
