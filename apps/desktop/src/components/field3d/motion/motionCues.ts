import {
    ActiveEquipmentMove,
    EquipmentMoveTarget,
    findActiveMove,
    MoveCandidate,
    ResolvedTimed,
} from "../scene/equipmentMoves";
import { DecodedMotionClip, sampleClip } from "./motionClip";
import { Pose, POSE_SIZE, REST_POSE } from "./skeleton";

/**
 * When a performer plays a motion clip: who, from which count of which page,
 * and for how many counts. The clip is stretched or squeezed to fill the
 * counts, so it stays on the music whatever the tempo.
 */
export interface MotionCue {
    id: string;
    clipId: string;
    target: EquipmentMoveTarget;
    /** The page whose counts `startCount` is measured in */
    pageId: number;
    /** Where the cue starts, in counts from the start of the page */
    startCount: number;
    /** How long the cue lasts, in counts. It may run past the end of the page. */
    lengthCounts: number;
    /** Swap left and right (e.g. a capture recorded as a mirror image) */
    mirror: boolean;
    /** The hand holding the bottom of a flag pole or the butt of a rifle */
    propHand: PropHand;
}

export type PropHand = "left" | "right";
export const PROP_HANDS: readonly PropHand[] = ["left", "right"];

/** Longest cue, in counts */
export const MAX_CUE_COUNTS = 512;

export type ResolvedMotionCue = ResolvedTimed<MotionCue>;
export type ActiveMotionCue = ActiveEquipmentMove<MotionCue>;

/** Seconds spent blending from standing into the clip, and back out of it */
export const BLEND_SECONDS = 0.35;

const smoothstep = (value: number) => {
    const t = Math.min(Math.max(value, 0), 1);
    return t * t * (3 - 2 * t);
};

/**
 * How much of the clip shows (0–1) at `progress` through a cue: eases in from
 * standing at the start and back out at the end, so cues never pop.
 */
export function cueBlendWeight(
    progress: number,
    durationSeconds: number,
): number {
    const blend = Math.min(BLEND_SECONDS, durationSeconds / 2);
    if (blend <= 0) return 1;
    const elapsed = progress * durationSeconds;
    const remaining = durationSeconds - elapsed;
    return smoothstep(Math.min(elapsed, remaining) / blend);
}

/** The cue a marcher is performing at `timeMs`, if its clip exists. */
export function findActiveCue(
    resolved: readonly ResolvedMotionCue[],
    clips: ReadonlyMap<string, DecodedMotionClip>,
    marcher: MoveCandidate,
    timeMs: number,
): ActiveMotionCue | null {
    const active = findActiveMove(resolved, marcher, timeMs);
    return active && clips.has(active.move.clipId) ? active : null;
}

/** Marchers performing a clip at `timeMs`; their usual body is not drawn. */
export function performingMarcherIds(
    resolved: readonly ResolvedMotionCue[],
    clips: ReadonlyMap<string, DecodedMotionClip>,
    marchers: readonly MoveCandidate[],
    timeMs: number | undefined,
): Set<number> {
    const ids = new Set<number>();
    if (timeMs === undefined || resolved.length === 0) return ids;
    for (const marcher of marchers)
        if (findActiveCue(resolved, clips, marcher, timeMs))
            ids.add(marcher.marcherId);
    return ids;
}

/**
 * The performer's pose during a cue: the clip at the matching point, blended
 * with standing near the cue's ends.
 *
 * @returns `out`, or null when the cue's clip is missing
 */
export function performerPose(
    active: ActiveMotionCue,
    clips: ReadonlyMap<string, DecodedMotionClip>,
    out: Pose,
): Pose | null {
    const clip = clips.get(active.move.clipId);
    if (!clip) return null;
    sampleClip(
        clip,
        active.progress * clip.durationSeconds,
        out,
        active.move.mirror,
    );
    const weight = cueBlendWeight(active.progress, active.durationSeconds);
    if (weight < 1)
        for (let i = 0; i < POSE_SIZE; i++)
            out[i] = REST_POSE[i] + (out[i] - REST_POSE[i]) * weight;
    return out;
}
