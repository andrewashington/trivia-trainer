/** Shared types for the world module. */

export type FacingDirection = "down" | "up" | "left" | "right";

export interface PlayerState {
  x: number;
  y: number;
  facing: FacingDirection;
  moving: boolean;
}
