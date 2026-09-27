import type { CameraPose } from "./defaultCamera";

/** A camera pose to pass through at a moment of the show. */
export interface CameraKeyframe {
    /** Stable ID for lists and editing */
    id: string;
    /** Show time in milliseconds */
    timeMs: number;
    pose: CameraPose;
}

export function sortKeyframes(
    keyframes: readonly CameraKeyframe[],
): CameraKeyframe[] {
    return [...keyframes].sort((a, b) => a.timeMs - b.timeMs);
}

/** Flattens a pose into numbers so every part is interpolated the same way. */
const toVector = ({ position, target, fov }: CameraPose): number[] => [
    ...position,
    ...target,
    fov,
];
const fromVector = (v: number[]): CameraPose => ({
    position: [v[0], v[1], v[2]],
    target: [v[3], v[4], v[5]],
    fov: v[6],
});

/**
 * Tangent at keyframe `i` (units per millisecond): the slope between its
 * neighbors (Catmull-Rom, allowing uneven spacing), and zero at the first and
 * last keyframe so the camera eases in and out of the move.
 */
function tangent(
    times: number[],
    values: number[][],
    i: number,
    component: number,
): number {
    if (i === 0 || i === times.length - 1) return 0;
    const span = times[i + 1] - times[i - 1];
    if (span <= 0) return 0;
    return (values[i + 1][component] - values[i - 1][component]) / span;
}

/**
 * The camera pose at `timeMs`. The path passes through every keyframe and
 * moves smoothly between them (cubic Hermite with Catmull-Rom tangents).
 * Before the first keyframe and after the last, the camera holds still.
 *
 * @returns null when there are no keyframes
 */
export function cameraPoseAtTime(
    keyframes: readonly CameraKeyframe[],
    timeMs: number,
): CameraPose | null {
    if (keyframes.length === 0) return null;
    const sorted = sortKeyframes(keyframes);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (timeMs <= first.timeMs) return first.pose;
    if (timeMs >= last.timeMs) return last.pose;

    let i = 0;
    while (sorted[i + 1].timeMs <= timeMs) i++;
    const times = sorted.map((keyframe) => keyframe.timeMs);
    const values = sorted.map((keyframe) => toVector(keyframe.pose));
    const t0 = times[i];
    const duration = times[i + 1] - t0;
    if (duration <= 0) return sorted[i + 1].pose;

    const s = (timeMs - t0) / duration;
    const s2 = s * s;
    const s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1;
    const h10 = s3 - 2 * s2 + s;
    const h01 = -2 * s3 + 3 * s2;
    const h11 = s3 - s2;
    const result = values[i].map(
        (start, component) =>
            h00 * start +
            h10 * duration * tangent(times, values, i, component) +
            h01 * values[i + 1][component] +
            h11 * duration * tangent(times, values, i + 1, component),
    );
    return fromVector(result);
}

let idCounter = 0;
/** A new keyframe ID, unique within this session. */
export function newKeyframeId(): string {
    idCounter++;
    return `${Date.now().toString(36)}-${idCounter}`;
}

/**
 * Adds a keyframe, replacing any keyframe already at the same time (so
 * "add at the current time" updates it instead of stacking duplicates).
 */
export function upsertKeyframe(
    keyframes: readonly CameraKeyframe[],
    keyframe: CameraKeyframe,
): CameraKeyframe[] {
    return sortKeyframes([
        ...keyframes.filter(
            (existing) =>
                existing.id !== keyframe.id &&
                existing.timeMs !== keyframe.timeMs,
        ),
        keyframe,
    ]);
}

/** Keeps only well-formed keyframes, for data read back from storage. */
export function sanitizeKeyframes(value: unknown): CameraKeyframe[] {
    if (!Array.isArray(value)) return [];
    const isTriple = (v: unknown): v is [number, number, number] =>
        Array.isArray(v) &&
        v.length === 3 &&
        v.every((n) => typeof n === "number" && Number.isFinite(n));
    return sortKeyframes(
        value.filter(
            (item): item is CameraKeyframe =>
                typeof item === "object" &&
                item !== null &&
                typeof item.id === "string" &&
                typeof item.timeMs === "number" &&
                Number.isFinite(item.timeMs) &&
                typeof item.pose === "object" &&
                item.pose !== null &&
                isTriple(item.pose.position) &&
                isTriple(item.pose.target) &&
                typeof item.pose.fov === "number" &&
                item.pose.fov > 0,
        ),
    );
}
