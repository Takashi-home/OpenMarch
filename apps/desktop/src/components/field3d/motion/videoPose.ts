import { MotionImportError } from "./importMotion";
import {
    encodeMotionFrames,
    MAX_CLIP_FRAMES,
    MotionClip,
    newMotionId,
} from "./motionClip";
import { MotionSmoothing, normalizeMotion } from "./normalizeMotion";
import { MOTION_JOINTS, MotionJoint, POSE_SIZE } from "./skeleton";

/**
 * Turns pose estimates from a video (MediaPipe Pose Landmarker: 33 landmarks
 * per person, per frame) into a performer motion clip. Browser-only work
 * (decoding the video, running the model) lives in `videoCapture.ts`; this
 * file is plain math so it can be tested.
 */

/** A landmark in metres around the hips (MediaPipe world landmarks). */
export interface WorldPoint {
    x: number;
    y: number;
    z: number;
}

/** A landmark on the image, 0–1 across and down (MediaPipe landmarks). */
export interface ImagePoint {
    x: number;
    y: number;
}

/** One person found in one video frame. */
export interface DetectedPerson {
    image: readonly ImagePoint[];
    world: readonly WorldPoint[];
}

/** MediaPipe pose landmark indices used here */
const MP = {
    leftEar: 7,
    rightEar: 8,
    leftShoulder: 11,
    rightShoulder: 12,
    leftElbow: 13,
    rightElbow: 14,
    leftWrist: 15,
    rightWrist: 16,
    leftPinky: 17,
    rightPinky: 18,
    leftIndex: 19,
    rightIndex: 20,
    leftHip: 23,
    rightHip: 24,
    leftKnee: 25,
    rightKnee: 26,
    leftAnkle: 27,
    rightAnkle: 28,
    leftFootIndex: 31,
    rightFootIndex: 32,
} as const;
export const MEDIAPIPE_LANDMARK_COUNT = 33;

/** Each performer joint as the average of these landmarks. */
const LANDMARKS_FOR_JOINT: Record<MotionJoint, readonly number[]> = {
    hips: [MP.leftHip, MP.rightHip],
    neck: [MP.leftShoulder, MP.rightShoulder],
    head: [MP.leftEar, MP.rightEar],
    leftShoulder: [MP.leftShoulder],
    leftElbow: [MP.leftElbow],
    leftWrist: [MP.leftWrist],
    leftHand: [MP.leftPinky, MP.leftIndex],
    rightShoulder: [MP.rightShoulder],
    rightElbow: [MP.rightElbow],
    rightWrist: [MP.rightWrist],
    rightHand: [MP.rightPinky, MP.rightIndex],
    leftHip: [MP.leftHip],
    leftKnee: [MP.leftKnee],
    leftAnkle: [MP.leftAnkle],
    leftToe: [MP.leftFootIndex],
    rightHip: [MP.rightHip],
    rightKnee: [MP.rightKnee],
    rightAnkle: [MP.rightAnkle],
    rightToe: [MP.rightFootIndex],
};

/** Writes the performer joints for one person's world landmarks into `out`. */
export function landmarksToPose(
    world: readonly WorldPoint[],
    out: Float32Array,
): Float32Array {
    if (world.length < MEDIAPIPE_LANDMARK_COUNT)
        throw new Error("A pose needs all 33 landmarks");
    MOTION_JOINTS.forEach((joint, index) => {
        const sources = LANDMARKS_FOR_JOINT[joint];
        let x = 0;
        let y = 0;
        let z = 0;
        for (const source of sources) {
            x += world[source].x;
            y += world[source].y;
            z += world[source].z;
        }
        out[index * 3] = x / sources.length;
        out[index * 3 + 1] = y / sources.length;
        out[index * 3 + 2] = z / sources.length;
    });
    return out;
}

/** Where a person is on the image: between their hips. */
export function personCenter(
    person: Pick<DetectedPerson, "image">,
): ImagePoint {
    const left = person.image[MP.leftHip];
    const right = person.image[MP.rightHip];
    return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
}

/** How much of the image a person covers (their landmarks' bounding box). */
export function personArea(person: Pick<DetectedPerson, "image">): number {
    const xs = person.image.map((point) => point.x);
    const ys = person.image.map((point) => point.y);
    return (
        (Math.max(...xs) - Math.min(...xs)) *
        (Math.max(...ys) - Math.min(...ys))
    );
}

/**
 * Farthest a tracked performer may move on the image between two frames
 * (share of the image); a farther match is someone else, not them.
 */
export const MAX_TRACK_JUMP = 0.15;

/**
 * The person nearest `target` on the image, or -1 when nobody is near
 * enough: with a whole guard on the floor, jumping to a neighbor would mix
 * two performers' motions.
 */
export function pickPerson(
    people: readonly Pick<DetectedPerson, "image">[],
    target: ImagePoint,
    maxDistance = MAX_TRACK_JUMP,
): number {
    let best = -1;
    let bestDistance = maxDistance;
    people.forEach((person, index) => {
        const center = personCenter(person);
        const distance = Math.hypot(center.x - target.x, center.y - target.y);
        if (distance <= bestDistance) {
            best = index;
            bestDistance = distance;
        }
    });
    return best;
}

/** The person taking up the most of the image, or -1 when there is nobody. */
export function largestPerson(
    people: readonly Pick<DetectedPerson, "image">[],
): number {
    let best = -1;
    let bestArea = 0;
    people.forEach((person, index) => {
        const area = personArea(person);
        if (area > bestArea) {
            best = index;
            bestArea = area;
        }
    });
    return best;
}

/**
 * Follows one performer through the video: each frame, the person nearest
 * where they were last seen (or, with no starting point, the largest one).
 */
export interface PerformerTracker {
    /**
     * Takes the people found in the next frame.
     *
     * @returns The tracked performer, or null when they were not found
     */
    next(people: readonly DetectedPerson[]): DetectedPerson | null;
}

export function createPerformerTracker(
    start: ImagePoint | null,
): PerformerTracker {
    let target = start;
    return {
        next(people) {
            const index = target
                ? pickPerson(people, target)
                : largestPerson(people);
            if (index < 0) return null;
            const person = people[index];
            target = personCenter(person);
            return person;
        },
    };
}

/** Least share of frames the performer must be found in */
export const MIN_FOUND_SHARE = 0.6;

/**
 * Fills frames where the performer was not found by blending the nearest
 * found frames before and after (holding the first or last at the ends).
 *
 * @throws MotionImportError ("noPerformer") when too few frames were found
 */
export function fillMissingFrames(
    frames: Float32Array,
    found: readonly boolean[],
): void {
    const frameCount = found.length;
    const foundCount = found.filter(Boolean).length;
    if (frameCount === 0 || foundCount / frameCount < MIN_FOUND_SHARE)
        throw new MotionImportError("noPerformer", {
            percent: Math.round((foundCount / Math.max(frameCount, 1)) * 100),
        });
    const copyFrame = (to: number, from: number) =>
        frames.copyWithin(
            to * POSE_SIZE,
            from * POSE_SIZE,
            (from + 1) * POSE_SIZE,
        );

    let previous = -1;
    for (let frame = 0; frame <= frameCount; frame++) {
        if (frame < frameCount && !found[frame]) continue;
        // Frames previous+1 … frame-1 are missing
        for (let gap = previous + 1; gap < frame; gap++) {
            if (previous < 0) copyFrame(gap, frame);
            else if (frame >= frameCount) copyFrame(gap, previous);
            else {
                const t = (gap - previous) / (frame - previous);
                for (let i = 0; i < POSE_SIZE; i++) {
                    const a = frames[previous * POSE_SIZE + i];
                    const b = frames[frame * POSE_SIZE + i];
                    frames[gap * POSE_SIZE + i] = a + (b - a) * t;
                }
            }
        }
        previous = frame;
    }
}

/**
 * How many frames to sample between two video times.
 *
 * @throws MotionImportError when the span is empty or longer than a clip may be
 */
export function videoFrameCount(
    startSeconds: number,
    endSeconds: number,
    fps: number,
): number {
    const frames = Math.floor((endSeconds - startSeconds) * fps) + 1;
    if (!(frames >= 2)) throw new MotionImportError("noAnimation");
    if (frames > MAX_CLIP_FRAMES)
        throw new MotionImportError("tooLong", {
            seconds: Math.round(endSeconds - startSeconds),
            max: Math.round((MAX_CLIP_FRAMES - 1) / fps),
        });
    return frames;
}

/**
 * Makes a clip from the performer's per-frame world landmarks (null where
 * they were not found): gaps filled, normalized like an imported motion and
 * grounded frame by frame (video estimates keep no height of their own).
 */
export function clipFromVideoPoses(
    poses: readonly (readonly WorldPoint[] | null)[],
    fps: number,
    smoothing: MotionSmoothing,
    name: string,
): MotionClip {
    const frameCount = poses.length;
    const frames = new Float32Array(frameCount * POSE_SIZE);
    const found = poses.map((world, frame) => {
        if (!world) return false;
        landmarksToPose(world, frames.subarray(frame * POSE_SIZE));
        return true;
    });
    fillMissingFrames(frames, found);
    normalizeMotion(frames, frameCount, fps, smoothing, { hipCentered: true });
    return {
        id: newMotionId("c"),
        name,
        fps,
        frameCount,
        data: encodeMotionFrames(frames),
    };
}
