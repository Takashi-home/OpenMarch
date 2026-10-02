import { MIRRORED_JOINTS, Pose, POSE_SIZE } from "./skeleton";

/**
 * A performer's motion, imported from a motion capture or animation file and
 * saved with the show. Joint positions are stored as whole millimeters
 * (16-bit, little-endian) in base64, so a minute of motion is about 180 kB.
 */
export interface MotionClip {
    id: string;
    /** Shown in lists; the imported file's name */
    name: string;
    /** Frames per second */
    fps: number;
    frameCount: number;
    /** `frameCount` poses in `MOTION_JOINTS` order, see `encodeMotionFrames` */
    data: string;
}

/** Frames per second clips are sampled at when imported */
export const MOTION_FPS = 30;
/** Longest clip, in seconds */
export const MAX_CLIP_SECONDS = 180;
/** Most frames in one clip */
export const MAX_CLIP_FRAMES = MAX_CLIP_SECONDS * MOTION_FPS + 1;
/** Most clips in one show */
export const MAX_CLIPS = 64;

const MILLIMETERS = 1000;
const INT16_LIMIT = 32767;

export function clipDurationSeconds(
    clip: Pick<MotionClip, "fps" | "frameCount">,
): number {
    return clip.frameCount > 1 ? (clip.frameCount - 1) / clip.fps : 0;
}

let idCounter = 0;
/** A new clip or cue ID, unique within this session. */
export function newMotionId(prefix: "c" | "q"): string {
    idCounter++;
    return `${Date.now().toString(36)}-${prefix}${idCounter}`;
}

function bytesToBase64(bytes: Uint8Array): string {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk)
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

/** Packs poses (meters) into the stored form. */
export function encodeMotionFrames(frames: Float32Array): string {
    const view = new DataView(new ArrayBuffer(frames.length * 2));
    frames.forEach((value, index) => {
        const millimeters = Math.round(value * MILLIMETERS);
        view.setInt16(
            index * 2,
            Math.min(Math.max(millimeters, -INT16_LIMIT), INT16_LIMIT),
            true,
        );
    });
    return bytesToBase64(new Uint8Array(view.buffer));
}

/** Unpacks stored poses back to meters. */
export function decodeMotionFrames(data: string): Float32Array {
    const bytes = base64ToBytes(data);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
    const frames = new Float32Array(Math.floor(bytes.length / 2));
    for (let i = 0; i < frames.length; i++)
        frames[i] = view.getInt16(i * 2, true) / MILLIMETERS;
    return frames;
}

/** A clip ready to play: poses unpacked once, then sampled every frame. */
export interface DecodedMotionClip {
    id: string;
    fps: number;
    frameCount: number;
    durationSeconds: number;
    frames: Float32Array;
}

/**
 * Unpacks a clip, or returns null when its data does not hold `frameCount`
 * poses (a damaged show file).
 */
export function decodeMotionClip(clip: MotionClip): DecodedMotionClip | null {
    try {
        const frames = decodeMotionFrames(clip.data);
        if (clip.frameCount < 1 || frames.length < clip.frameCount * POSE_SIZE)
            return null;
        return {
            id: clip.id,
            fps: clip.fps,
            frameCount: clip.frameCount,
            durationSeconds: clipDurationSeconds(clip),
            frames,
        };
    } catch {
        return null;
    }
}

/** Unpacks every clip that is intact, by ID. */
export function decodeMotionClips(
    clips: readonly MotionClip[],
): Map<string, DecodedMotionClip> {
    return new Map(
        clips.flatMap((clip) => {
            const decoded = decodeMotionClip(clip);
            return decoded ? [[clip.id, decoded] as const] : [];
        }),
    );
}

/** Catmull-Rom: passes through every frame with no corners between them. */
function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number) {
    const t2 = t * t;
    const t3 = t2 * t;
    return (
        0.5 *
        (2 * p1 +
            (p2 - p0) * t +
            (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
            (3 * p1 - p0 - 3 * p2 + p3) * t3)
    );
}

/**
 * The pose `seconds` into a clip, smoothly between frames. Times before the
 * start or past the end hold the first or last pose.
 *
 * @param mirror - Swap left and right, as if seen in a mirror
 */
export function sampleClip(
    clip: DecodedMotionClip,
    seconds: number,
    out: Pose,
    mirror = false,
): Pose {
    const last = clip.frameCount - 1;
    const position = Math.min(Math.max(seconds * clip.fps, 0), last);
    const frame = Math.floor(position);
    const t = position - frame;
    const at = (index: number) =>
        Math.min(Math.max(index, 0), last) * POSE_SIZE;
    const f0 = at(frame - 1);
    const f1 = at(frame);
    const f2 = at(frame + 1);
    const f3 = at(frame + 2);
    const { frames } = clip;
    for (let i = 0; i < POSE_SIZE; i++)
        out[i] = catmullRom(
            frames[f0 + i],
            frames[f1 + i],
            frames[f2 + i],
            frames[f3 + i],
            t,
        );
    return mirror ? mirrorPose(out) : out;
}

/** Swaps left and right joints in place and flips across the body's middle. */
export function mirrorPose(pose: Pose): Pose {
    for (const [left, right] of MIRRORED_JOINTS) {
        for (let axis = 0; axis < 3; axis++) {
            const a = left * 3 + axis;
            const b = right * 3 + axis;
            const swap = pose[a];
            pose[a] = pose[b];
            pose[b] = swap;
        }
    }
    for (let i = 0; i < POSE_SIZE; i += 3) pose[i] = -pose[i];
    return pose;
}
