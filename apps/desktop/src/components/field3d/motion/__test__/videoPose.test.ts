import { describe, expect, it } from "vitest";
import { decodeMotionClip, MAX_CLIP_SECONDS } from "../motionClip";
import { JOINT, MotionJoint, POSE_SIZE } from "../skeleton";
import {
    clipFromVideoPoses,
    createPerformerTracker,
    DetectedPerson,
    fillMissingFrames,
    landmarksToPose,
    MEDIAPIPE_LANDMARK_COUNT,
    pickPerson,
    videoFrameCount,
    WorldPoint,
} from "../videoPose";

type Point = [x: number, y: number, z: number];

/**
 * World landmarks as MediaPipe gives them for a performer facing the camera:
 * metres around the hips, y down, their left toward +x, nearer the camera
 * toward -z.
 */
const STANDING: Record<number, Point> = {
    7: [0.08, -0.68, 0],
    8: [-0.08, -0.68, 0],
    11: [0.18, -0.5, 0],
    12: [-0.18, -0.5, 0],
    13: [0.2, -0.22, 0],
    14: [-0.2, -0.22, 0],
    15: [0.21, 0.05, 0],
    16: [-0.21, 0.05, 0],
    17: [0.21, 0.13, 0],
    18: [-0.21, 0.13, 0],
    19: [0.21, 0.13, -0.02],
    20: [-0.21, 0.13, -0.02],
    23: [0.1, 0, 0],
    24: [-0.1, 0, 0],
    25: [0.1, 0.42, 0],
    26: [-0.1, 0.42, 0],
    27: [0.1, 0.82, 0],
    28: [-0.1, 0.82, 0],
    31: [0.1, 0.87, -0.12],
    32: [-0.1, 0.87, -0.12],
};

/** Both knees on the ground, shins flat behind (away from the camera). */
const KNEELING: Record<number, Point> = {
    ...STANDING,
    27: [0.1, 0.4, 0.4],
    28: [-0.1, 0.4, 0.4],
    31: [0.1, 0.45, 0.5],
    32: [-0.1, 0.45, 0.5],
};

function world(points: Record<number, Point>): WorldPoint[] {
    return Array.from({ length: MEDIAPIPE_LANDMARK_COUNT }, (_, index) => {
        const [x, y, z] = points[index] ?? [0, 0, 0];
        return { x, y, z };
    });
}

/** A person with their hips at (x, y) on the image, `size` tall. */
function person(x: number, y: number, size = 0.4): DetectedPerson {
    const image = Array.from({ length: MEDIAPIPE_LANDMARK_COUNT }, (_, i) => ({
        x: x + (i % 2 === 0 ? -0.02 : 0.02),
        y: y + (i / MEDIAPIPE_LANDMARK_COUNT - 0.5) * size,
    }));
    image[23] = { x: x + 0.02, y };
    image[24] = { x: x - 0.02, y };
    return { image, world: world(STANDING) };
}

const coord = (pose: Float32Array, joint: MotionJoint, axis: 0 | 1 | 2) =>
    pose[JOINT[joint] * 3 + axis];

/** The error `run` throws, for checking its reason. */
function errorOf(run: () => unknown): unknown {
    try {
        run();
    } catch (error) {
        return error;
    }
    return undefined;
}

describe("landmarksToPose", () => {
    it("takes the hips between the hip landmarks and hands at the knuckles", () => {
        const pose = landmarksToPose(
            world(STANDING),
            new Float32Array(POSE_SIZE),
        );
        expect(coord(pose, "hips", 0)).toBeCloseTo(0, 6);
        expect(coord(pose, "neck", 1)).toBeCloseTo(-0.5, 6);
        expect(coord(pose, "leftHand", 2)).toBeCloseTo(-0.01, 6);
        expect(coord(pose, "rightToe", 0)).toBeCloseTo(-0.1, 6);
    });
});

describe("following a performer", () => {
    it("picks the person nearest the point, and nobody when all are far", () => {
        const people = [person(0.2, 0.5), person(0.6, 0.5)];
        expect(pickPerson(people, { x: 0.55, y: 0.5 })).toBe(1);
        expect(pickPerson(people, { x: 0.95, y: 0.1 })).toBe(-1);
    });

    it("keeps following them when the detector lists people in another order", () => {
        const tracker = createPerformerTracker({ x: 0.6, y: 0.5 });
        const first = tracker.next([person(0.2, 0.5), person(0.6, 0.5)]);
        const second = tracker.next([person(0.62, 0.5), person(0.22, 0.5)]);
        expect(first?.image[23].x).toBeCloseTo(0.62, 6);
        expect(second?.image[23].x).toBeCloseTo(0.64, 6);
    });

    it("does not jump to a neighbor while the performer is hidden", () => {
        const tracker = createPerformerTracker({ x: 0.6, y: 0.5 });
        tracker.next([person(0.6, 0.5)]);
        expect(tracker.next([person(0.2, 0.5)])).toBeNull();
        // Back in view: found again where they were
        const back = tracker.next([person(0.2, 0.5), person(0.61, 0.5)]);
        expect(back?.image[23].x).toBeCloseTo(0.63, 6);
    });

    it("follows the largest person when none was chosen", () => {
        const tracker = createPerformerTracker(null);
        const found = tracker.next([
            person(0.2, 0.5, 0.2),
            person(0.7, 0.5, 0.6),
        ]);
        expect(found?.image[23].x).toBeCloseTo(0.72, 6);
    });
});

describe("fillMissingFrames", () => {
    const framesOf = (values: number[]) => {
        const frames = new Float32Array(values.length * POSE_SIZE);
        values.forEach((value, frame) =>
            frames.fill(value, frame * POSE_SIZE, (frame + 1) * POSE_SIZE),
        );
        return frames;
    };

    it("blends across gaps and holds the ends", () => {
        const frames = framesOf([0, 2, 0, 4, 5, 6, 7, 0]);
        fillMissingFrames(frames, [
            false,
            true,
            false,
            true,
            true,
            true,
            true,
            false,
        ]);
        expect(
            [0, 1, 2, 3, 4, 5, 6, 7].map((frame) => frames[frame * POSE_SIZE]),
        ).toEqual([2, 2, 3, 4, 5, 6, 7, 7]);
    });

    it("gives up when the performer is missing from most frames", () => {
        const error = errorOf(() =>
            fillMissingFrames(framesOf([1, 0, 0, 0]), [
                true,
                false,
                false,
                false,
            ]),
        );
        expect(error).toMatchObject({
            reason: "noPerformer",
            details: { percent: 25 },
        });
    });
});

describe("videoFrameCount", () => {
    it("samples both ends of the span", () => {
        expect(videoFrameCount(1, 3, 30)).toBe(61);
    });

    it("refuses an empty span or one longer than a clip", () => {
        expect(errorOf(() => videoFrameCount(2, 2, 30))).toMatchObject({
            reason: "noAnimation",
        });
        expect(
            errorOf(() => videoFrameCount(0, MAX_CLIP_SECONDS + 5, 30)),
        ).toMatchObject({ reason: "tooLong" });
    });
});

describe("clipFromVideoPoses", () => {
    /** 1 s standing, then 1 s kneeling, with one dropped frame */
    const poses = [
        ...Array.from({ length: 30 }, () => world(STANDING)),
        ...Array.from({ length: 30 }, () => world(KNEELING)),
    ].map((pose, frame) => (frame === 12 ? null : pose));

    const frameOf = (() => {
        const decoded = decodeMotionClip(
            clipFromVideoPoses(poses, 30, "none", "solo"),
        )!;
        return (frame: number) =>
            decoded.frames.subarray(frame * POSE_SIZE, (frame + 1) * POSE_SIZE);
    })();

    it("stands the performer up, facing forward, feet on the ground", () => {
        const pose = frameOf(10);
        expect(coord(pose, "head", 1)).toBeGreaterThan(1.3);
        expect(coord(pose, "leftHip", 0)).toBeGreaterThan(
            coord(pose, "rightHip", 0),
        );
        expect(coord(pose, "leftToe", 1)).toBeCloseTo(0.03, 2);
        // Toes ahead of the ankles: facing +Z
        expect(coord(pose, "leftToe", 2)).toBeGreaterThan(
            coord(pose, "leftAnkle", 2),
        );
    });

    it("keeps a kneel on the ground instead of floating", () => {
        const pose = frameOf(45);
        expect(coord(pose, "leftKnee", 1)).toBeCloseTo(0.06, 2);
        expect(coord(pose, "hips", 1)).toBeLessThan(0.6);
    });

    it("fills the dropped frame", () => {
        expect(coord(frameOf(12), "head", 1)).toBeGreaterThan(1.3);
    });
});
