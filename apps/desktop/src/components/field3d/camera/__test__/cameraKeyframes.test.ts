import { describe, expect, it } from "vitest";
import type { CameraPose } from "../defaultCamera";
import {
    CameraKeyframe,
    cameraPoseAtTime,
    sanitizeKeyframes,
    upsertKeyframe,
} from "../cameraKeyframes";

const pose = (x: number, fov = 50): CameraPose => ({
    position: [x, 10, 20],
    target: [x, 0, 0],
    fov,
});
const keyframe = (id: string, timeMs: number, x: number): CameraKeyframe => ({
    id,
    timeMs,
    pose: pose(x),
});

describe("cameraPoseAtTime", () => {
    const keyframes = [
        keyframe("c", 4000, 40),
        keyframe("a", 0, 0),
        keyframe("b", 2000, 20),
    ];

    it("returns null without keyframes", () => {
        expect(cameraPoseAtTime([], 1000)).toBeNull();
    });

    it("passes through every keyframe, in time order", () => {
        expect(cameraPoseAtTime(keyframes, 0)!.position[0]).toBeCloseTo(0);
        expect(cameraPoseAtTime(keyframes, 2000)!.position[0]).toBeCloseTo(20);
        expect(cameraPoseAtTime(keyframes, 4000)!.position[0]).toBeCloseTo(40);
    });

    it("holds still before the first and after the last keyframe", () => {
        expect(cameraPoseAtTime(keyframes, -500)).toEqual(pose(0));
        expect(cameraPoseAtTime(keyframes, 9000)).toEqual(pose(40));
    });

    it("moves smoothly: eases out of the first keyframe and keeps speed through the middle one", () => {
        const at = (t: number) => cameraPoseAtTime(keyframes, t)!.position[0];
        // Slow start: less than a straight line would cover
        expect(at(200)).toBeLessThan(2);
        expect(at(200)).toBeGreaterThan(0);
        // Through the middle keyframe the speed is about 10 units per second on both sides
        const before = (at(2000) - at(1990)) / 10;
        const after = (at(2010) - at(2000)) / 10;
        expect(before).toBeCloseTo(after, 2);
        expect(before).toBeCloseTo(0.01, 2);
    });

    it("interpolates the field of view too", () => {
        const zoom = [
            { id: "a", timeMs: 0, pose: pose(0, 40) },
            { id: "b", timeMs: 1000, pose: pose(0, 60) },
        ];
        expect(cameraPoseAtTime(zoom, 500)!.fov).toBeCloseTo(50);
    });
});

describe("upsertKeyframe", () => {
    it("replaces a keyframe at the same time instead of stacking another", () => {
        const start = [keyframe("a", 0, 0), keyframe("b", 1000, 10)];
        const result = upsertKeyframe(start, keyframe("new", 1000, 99));
        expect(result.map((k) => k.id)).toEqual(["a", "new"]);
    });

    it("moves an edited keyframe and keeps the list sorted", () => {
        const start = [keyframe("a", 0, 0), keyframe("b", 1000, 10)];
        const result = upsertKeyframe(start, { ...start[0], timeMs: 3000 });
        expect(result.map((k) => [k.id, k.timeMs])).toEqual([
            ["b", 1000],
            ["a", 3000],
        ]);
    });
});

describe("sanitizeKeyframes", () => {
    it("drops malformed entries from storage", () => {
        const good = keyframe("a", 500, 1);
        expect(
            sanitizeKeyframes([
                good,
                { id: "b", timeMs: "soon", pose: pose(1) },
                {
                    id: "c",
                    timeMs: 1,
                    pose: { position: [1, 2], target: [0, 0, 0], fov: 50 },
                },
                null,
            ]),
        ).toEqual([good]);
        expect(sanitizeKeyframes("nope")).toEqual([]);
    });
});
