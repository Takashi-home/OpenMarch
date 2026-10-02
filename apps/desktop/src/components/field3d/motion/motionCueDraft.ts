import type Page from "@/global/classes/Page";
import {
    parseNumber,
    targetChoice,
    targetsOf,
} from "../equipment/equipmentMoveDraft";
import { clipDurationSeconds, MotionClip, newMotionId } from "./motionClip";
import { MAX_CUE_COUNTS, MotionCue, PropHand } from "./motionCues";

/**
 * The cue form works on text, so half-typed numbers are allowed while
 * editing; `cuesFromDraft` checks them when the cue is saved.
 */
export interface MotionCueDraft {
    clipId: string;
    /** A target choice: a section, one marcher, or the selection */
    target: string;
    startCount: string;
    lengthCounts: string;
    mirror: boolean;
    propHand: PropHand;
}

export function newCueDraft(clipId: string, target: string): MotionCueDraft {
    return {
        clipId,
        target,
        startCount: "0",
        lengthCounts: "8",
        mirror: false,
        propHand: "left",
    };
}

export function draftFromCue(cue: MotionCue): MotionCueDraft {
    return {
        clipId: cue.clipId,
        target: targetChoice(cue.target),
        startCount: String(cue.startCount),
        lengthCounts: String(cue.lengthCounts),
        mirror: cue.mirror,
        propHand: cue.propHand,
    };
}

/**
 * How many counts a clip lasts at its natural speed, from `startCount` of a
 * page: a cue of that length plays the clip neither faster nor slower.
 */
export function naturalLengthCounts(
    clip: Pick<MotionClip, "fps" | "frameCount">,
    page: Pick<Page, "duration" | "counts" | "beats">,
    startCount: number,
): number {
    const seconds = clipDurationSeconds(clip);
    const beatIndex = Math.min(
        Math.max(Math.floor(startCount), 0),
        page.beats.length - 1,
    );
    const secondsPerCount =
        page.beats[beatIndex]?.duration ??
        (page.counts > 0 ? page.duration / page.counts : 0);
    if (!(secondsPerCount > 0)) return 1;
    return Math.min(
        Math.max(Math.round(seconds / secondsPerCount), 1),
        MAX_CUE_COUNTS,
    );
}

/**
 * The cues a draft describes (one per marcher when given to the selection),
 * or null while a field is missing or out of range.
 *
 * @param existingId - Keeps this ID on the first cue when editing
 */
export function cuesFromDraft(
    draft: MotionCueDraft,
    {
        pageId,
        selectedMarcherIds,
        clipIds,
        existingId,
    }: {
        pageId: number;
        selectedMarcherIds: readonly number[];
        /** Clips that exist; a cue for any other clip is not made */
        clipIds: ReadonlySet<string>;
        existingId?: string;
    },
): MotionCue[] | null {
    const startCount = parseNumber(draft.startCount);
    const lengthCounts = parseNumber(draft.lengthCounts);
    if (!clipIds.has(draft.clipId)) return null;
    if (!Number.isFinite(startCount) || startCount < 0) return null;
    if (
        !Number.isFinite(lengthCounts) ||
        lengthCounts <= 0 ||
        lengthCounts > MAX_CUE_COUNTS
    )
        return null;

    const targets = targetsOf(draft.target, selectedMarcherIds);
    if (targets.length === 0) return null;
    return targets.map((target, index) => ({
        id: index === 0 && existingId ? existingId : newMotionId("q"),
        clipId: draft.clipId,
        target,
        pageId,
        startCount,
        lengthCounts,
        mirror: draft.mirror,
        propHand: draft.propHand,
    }));
}

/** The motion without a clip, and without the cues that played it. */
export function withoutClip(
    motion: { clips: readonly MotionClip[]; cues: readonly MotionCue[] },
    clipId: string,
): { clips: MotionClip[]; cues: MotionCue[] } {
    return {
        clips: motion.clips.filter((clip) => clip.id !== clipId),
        cues: motion.cues.filter((cue) => cue.clipId !== clipId),
    };
}
