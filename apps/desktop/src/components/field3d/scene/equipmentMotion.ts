import { Matrix4 } from "three";
import type { EquipmentKind } from "./equipment";
import { equipmentRig } from "./equipment";
import type { EquipmentMove } from "./equipmentMoves";

const GRAVITY = 9.81;
/** Lowest and highest a toss may go, in meters */
export const MIN_TOSS_HEIGHT = 0.3;
export const MAX_TOSS_HEIGHT = 10;
/** How far a sweep swings either side of upright, in radians (about 75°) */
export const SWEEP_AMPLITUDE = 1.3;
/** Share of a sweep spent easing in, and again easing out */
const SWEEP_EDGE = 0.15;

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);
/** 0 → 1 with zero slope at both ends */
const smoothstep = (value: number) => {
    const t = clamp01(value);
    return t * t * (3 - 2 * t);
};

/**
 * How high a toss rises, in meters. Physics sets it: thrown up and caught at
 * the same height, it is in the air for the whole move, so a longer move goes
 * higher (a 2 second toss peaks near 4.9 m).
 */
export function tossHeight(durationSeconds: number): number {
    const height = (GRAVITY * durationSeconds ** 2) / 8;
    return Math.min(Math.max(height, MIN_TOSS_HEIGHT), MAX_TOSS_HEIGHT);
}

/** Height above the hand during a toss, at `progress` (0–1) through it. */
export function tossLift(progress: number, durationSeconds: number): number {
    const t = clamp01(progress);
    return 4 * tossHeight(durationSeconds) * t * (1 - t);
}

/** Turn angle about the marcher's forward (Z) axis, seen from the front. */
function turnAngle(
    move: Pick<EquipmentMove, "move" | "turns" | "direction">,
    progress: number,
): number {
    // Positive about +Z is counterclockwise seen from in front of the marcher
    const sign = move.direction === "cw" ? -1 : 1;
    const turns = move.turns;
    switch (move.move) {
        case "spin":
            // Winds up and settles, so it blends into and out of the hold
            return sign * Math.PI * 2 * turns * smoothstep(progress);
        case "toss":
            // Free flight: steady turning
            return sign * Math.PI * 2 * turns * clamp01(progress);
        case "sweep": {
            const edge =
                smoothstep(progress / SWEEP_EDGE) *
                smoothstep((1 - progress) / SWEEP_EDGE);
            return (
                sign *
                SWEEP_AMPLITUDE *
                Math.sin(Math.PI * 2 * turns * clamp01(progress)) *
                edge
            );
        }
    }
}

const scratchTurn = new Matrix4();
const scratchBack = new Matrix4();

/**
 * How far a moving piece of equipment has shifted from its hold, as a matrix
 * in the marcher's space: apply it to the geometry drawn at rest. Turns happen
 * in the plane facing the audience. At progress 0 (and at 1 for whole turns)
 * it is the identity, so a move starts and ends in the hold.
 *
 * @returns `out`, or null when this equipment never moves
 */
export function equipmentMotionMatrix(
    kind: EquipmentKind,
    move: Pick<EquipmentMove, "move" | "turns" | "direction">,
    progress: number,
    durationSeconds: number,
    out: Matrix4,
): Matrix4 | null {
    const rig = equipmentRig(kind);
    if (!rig) return null;

    const tossed = move.move === "toss";
    const [px, py, pz] = tossed ? rig.centerOfMass : rig.grip;
    const lift = tossed ? tossLift(progress, durationSeconds) : 0;

    // Move the turning point to the origin, turn, then put it back (lifted)
    scratchBack.makeTranslation(-px, -py, -pz);
    scratchTurn.makeRotationZ(turnAngle(move, progress));
    out.makeTranslation(px, py + lift, pz);
    return out.multiply(scratchTurn).multiply(scratchBack);
}
