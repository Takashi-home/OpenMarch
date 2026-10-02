import { describe, expect, it } from "vitest";
import { importMotionFile, MotionImportError } from "../importMotion";
import { decodeMotionClip, MAX_CLIP_SECONDS } from "../motionClip";
import {
    bodyLength,
    JOINT,
    MotionJoint,
    POSE_SIZE,
    REST_POSE,
} from "../skeleton";
import { makeBvh } from "./bvhFixture";

const bytes = (text: string) =>
    new TextEncoder().encode(text).buffer as ArrayBuffer;

const coord = (pose: Float32Array, joint: MotionJoint, axis: 0 | 1 | 2) =>
    pose[JOINT[joint] * 3 + axis];

async function importBvh(text: string) {
    const clip = await importMotionFile("routine.bvh", bytes(text), "none");
    const decoded = decodeMotionClip(clip);
    if (!decoded) throw new Error("clip did not decode");
    const frame = (index: number) =>
        decoded.frames.subarray(index * POSE_SIZE, (index + 1) * POSE_SIZE);
    return { clip, decoded, frame };
}

describe("importMotionFile (BVH)", () => {
    it("samples the whole clip at 30 fps and keeps the file name", async () => {
        const { clip, decoded } = await importBvh(makeBvh({ frames: 61 }));
        expect(clip.name).toBe("routine.bvh");
        expect(clip.fps).toBe(30);
        expect(clip.frameCount).toBe(61);
        expect(decoded.durationSeconds).toBeCloseTo(2, 5);
    });

    it("sizes the performer like the figure", async () => {
        const { frame } = await importBvh(makeBvh());
        expect(bodyLength(frame(0))).toBeCloseTo(bodyLength(REST_POSE), 1);
    });

    it("stands the performer on the ground, head up", async () => {
        const { frame } = await importBvh(makeBvh());
        const pose = frame(0);
        expect(coord(pose, "leftToe", 1)).toBeCloseTo(0.03, 1);
        expect(coord(pose, "head", 1)).toBeGreaterThan(coord(pose, "hips", 1));
        expect(coord(pose, "hips", 1)).toBeGreaterThan(
            coord(pose, "leftKnee", 1),
        );
    });

    it("turns a performer facing sideways to face forward (+Z)", async () => {
        // Turned 90° about Y: the performer faces +X in the file
        const { frame } = await importBvh(
            makeBvh({ rootRotation: [0, 0, 90] }),
        );
        const pose = frame(0);
        // Facing +Z puts their left side toward +X
        expect(coord(pose, "leftHip", 0)).toBeGreaterThan(
            coord(pose, "rightHip", 0) + 0.1,
        );
        expect(
            Math.abs(coord(pose, "leftHip", 2) - coord(pose, "rightHip", 2)),
        ).toBeLessThan(0.01);
    });

    it("stands a Z-up capture upright", async () => {
        // Turned -90° about X: the performer's up is -Z in the file
        const { frame } = await importBvh(
            makeBvh({ rootRotation: [0, -90, 0] }),
        );
        const pose = frame(0);
        expect(coord(pose, "head", 1)).toBeGreaterThan(1.3);
        expect(coord(pose, "leftAnkle", 1)).toBeLessThan(0.2);
    });

    it("keeps a performer walking across the capture area on their spot", async () => {
        const { decoded, frame } = await importBvh(makeBvh({ travel: 300 }));
        for (let index = 0; index < decoded.frameCount; index++) {
            expect(Math.abs(coord(frame(index), "hips", 0))).toBeLessThan(0.01);
            expect(Math.abs(coord(frame(index), "hips", 2))).toBeLessThan(0.01);
        }
    });

    it("reads hands from the wrist's end site", async () => {
        const { frame } = await importBvh(makeBvh());
        const pose = frame(0);
        // Arms hang down: the hand is below the wrist
        expect(coord(pose, "leftHand", 1)).toBeLessThan(
            coord(pose, "leftWrist", 1),
        );
    });

    it("names the missing bones of a rig it cannot use", async () => {
        const text = makeBvh({
            rename: (name) => (name === "LeftForeArm" ? "Gizmo" : name),
        });
        await expect(
            importMotionFile("odd.bvh", bytes(text), "none"),
        ).rejects.toMatchObject({
            reason: "missingBones",
            details: { bones: "left.elbow" },
        });
    });

    it("refuses clips longer than the limit", async () => {
        const text = makeBvh({ frames: 3, frameTime: MAX_CLIP_SECONDS });
        await expect(
            importMotionFile("long.bvh", bytes(text), "none"),
        ).rejects.toMatchObject({ reason: "tooLong" });
    });

    it("refuses files it has no loader for", async () => {
        const attempt = importMotionFile("dance.mp4", bytes("x"), "none");
        await expect(attempt).rejects.toBeInstanceOf(MotionImportError);
        await expect(attempt).rejects.toMatchObject({ reason: "unsupported" });
    });

    it("reports a damaged BVH as unreadable", async () => {
        await expect(
            importMotionFile("broken.bvh", bytes("HIERARCHY\nnope"), "none"),
        ).rejects.toMatchObject({ reason: "unreadable" });
    });
});
