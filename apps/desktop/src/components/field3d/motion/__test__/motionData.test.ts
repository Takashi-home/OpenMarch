import { describe, expect, it } from "vitest";
import { matchBones, parseBoneName } from "../boneNames";
import {
    decodeMotionClip,
    DecodedMotionClip,
    encodeMotionFrames,
    mirrorPose,
    MotionClip,
    sampleClip,
} from "../motionClip";
import {
    BLEND_SECONDS,
    cueBlendWeight,
    findActiveCue,
    MotionCue,
    performerPose,
    performingMarcherIds,
    ResolvedMotionCue,
} from "../motionCues";
import {
    cuesFromDraft,
    naturalLengthCounts,
    newCueDraft,
    withoutClip,
} from "../motionCueDraft";
import { JOINT, POSE_SIZE, REST_POSE } from "../skeleton";

describe("parseBoneName", () => {
    it.each([
        ["mixamorig:LeftForeArm", "left", "forearm"],
        ["LeftUpLeg", "left", "upleg"],
        ["RightHand", "right", "hand"],
        ["lShldr", "left", "shldr"],
        ["rThigh", "right", "thigh"],
        ["J_Bip_L_UpperArm", "left", "upperarm"],
        ["J_Bip_C_Hips", null, "hips"],
        ["upper_arm.L", "left", "upperarm"],
        ["DEF-thigh.R", "right", "thigh"],
        ["lowerarm_l", "left", "lowerarm"],
        ["Left_knee", "left", "knee"],
        ["左ひじ", "left", "ひじ"],
        ["右足首", "right", "足首"],
        ["Hips", null, "hips"],
    ])("%s → %s %s", (name, side, base) => {
        expect(parseBoneName(name)).toEqual({ side, base });
    });
});

describe("matchBones", () => {
    const nodes = (names: string[]) => names.map((name) => ({ name }));

    it("takes the upper arm over the collarbone (Mixamo)", () => {
        const matched = matchBones(
            nodes(["mixamorig:LeftShoulder", "mixamorig:LeftArm"]),
        );
        expect(matched.get("left.upperArm")?.name).toBe("mixamorig:LeftArm");
    });

    it("uses the shoulder when there is no arm bone (joint-named rigs)", () => {
        const matched = matchBones(nodes(["left_shoulder", "left_elbow"]));
        expect(matched.get("left.upperArm")?.name).toBe("left_shoulder");
        expect(matched.get("left.elbow")?.name).toBe("left_elbow");
    });

    it("tells the pelvis from the thighs by side", () => {
        const matched = matchBones(nodes(["Hip", "LeftHip", "RightHip"]));
        expect(matched.get("hips")?.name).toBe("Hip");
        expect(matched.get("left.hip")?.name).toBe("LeftHip");
        expect(matched.get("right.hip")?.name).toBe("RightHip");
    });

    it("maps MMD bones (XR Animator)", () => {
        const matched = matchBones(
            nodes(["左腕", "左ひじ", "左手首", "左足", "左ひざ", "左足首"]),
        );
        expect(matched.get("left.upperArm")?.name).toBe("左腕");
        expect(matched.get("left.hip")?.name).toBe("左足");
        expect(matched.get("left.ankle")?.name).toBe("左足首");
    });
});

/** A clip whose every coordinate equals the frame number (in meters). */
function rampClip(frameCount: number, fps = 30): DecodedMotionClip {
    const frames = new Float32Array(frameCount * POSE_SIZE);
    for (let frame = 0; frame < frameCount; frame++)
        frames.fill(frame, frame * POSE_SIZE, (frame + 1) * POSE_SIZE);
    return {
        id: "c1",
        fps,
        frameCount,
        durationSeconds: (frameCount - 1) / fps,
        frames,
    };
}

describe("motion clip data", () => {
    it("round-trips poses to the millimeter", () => {
        const frames = Float32Array.from(
            { length: POSE_SIZE * 2 },
            (_, i) => (i - 20) * 0.0123,
        );
        const decoded = decodeMotionClip({
            id: "c",
            name: "a.bvh",
            fps: 30,
            frameCount: 2,
            data: encodeMotionFrames(frames),
        });
        expect(decoded).not.toBeNull();
        // Rounded to the nearest millimeter: off by half a millimeter at most
        decoded!.frames.forEach((value, i) =>
            expect(Math.abs(value - frames[i])).toBeLessThanOrEqual(0.0005001),
        );
    });

    it("rejects a clip whose data is short or damaged", () => {
        const clip: MotionClip = {
            id: "c",
            name: "a.bvh",
            fps: 30,
            frameCount: 3,
            data: encodeMotionFrames(new Float32Array(POSE_SIZE * 2)),
        };
        expect(decodeMotionClip(clip)).toBeNull();
        expect(decodeMotionClip({ ...clip, data: "@@@" })).toBeNull();
    });

    it("passes through every frame and moves smoothly between them", () => {
        const clip = rampClip(10);
        const out = new Float32Array(POSE_SIZE);
        expect(sampleClip(clip, 3 / 30, out)[0]).toBeCloseTo(3, 5);
        // A straight ramp stays straight between frames
        expect(sampleClip(clip, 3.5 / 30, out)[0]).toBeCloseTo(3.5, 5);
    });

    it("holds the first and last pose outside the clip", () => {
        const clip = rampClip(10);
        const out = new Float32Array(POSE_SIZE);
        expect(sampleClip(clip, -1, out)[0]).toBe(0);
        expect(sampleClip(clip, 99, out)[0]).toBe(9);
    });

    it("mirrors by swapping sides and flipping x", () => {
        const pose = Float32Array.from(REST_POSE);
        pose[JOINT.leftWrist * 3 + 1] = 2; // left hand raised
        mirrorPose(pose);
        expect(pose[JOINT.rightWrist * 3 + 1]).toBe(2);
        expect(pose[JOINT.rightWrist * 3]).toBeCloseTo(
            -REST_POSE[JOINT.leftWrist * 3],
            6,
        );
        expect(pose[JOINT.leftWrist * 3 + 1]).toBeCloseTo(
            REST_POSE[JOINT.rightWrist * 3 + 1],
            6,
        );
    });
});

const cue = (overrides: Partial<MotionCue> = {}): MotionCue => ({
    id: "q1",
    clipId: "c1",
    target: { kind: "section", section: "Color Guard" },
    pageId: 1,
    startCount: 0,
    lengthCounts: 8,
    mirror: false,
    propHand: "left",
    ...overrides,
});

const resolved = (
    move: MotionCue,
    startMs: number,
    endMs: number,
): ResolvedMotionCue => ({ move, startMs, endMs });

describe("motion cues", () => {
    const clips = new Map([["c1", rampClip(31)]]);
    const guard = { marcherId: 7, section: "Color Guard" };

    it("eases in and out of a cue", () => {
        expect(cueBlendWeight(0, 4)).toBe(0);
        expect(cueBlendWeight(0.5, 4)).toBe(1);
        expect(cueBlendWeight(1, 4)).toBe(0);
        const halfwayIn = BLEND_SECONDS / 2 / 4;
        expect(cueBlendWeight(halfwayIn, 4)).toBeCloseTo(0.5, 5);
    });

    it("finds the cue playing now, but not one whose clip is gone", () => {
        const cues = [resolved(cue(), 1000, 5000)];
        expect(findActiveCue(cues, clips, guard, 3000)?.progress).toBe(0.5);
        expect(findActiveCue(cues, clips, guard, 6000)).toBeNull();
        expect(findActiveCue(cues, new Map(), guard, 3000)).toBeNull();
    });

    it("lets a cue for one marcher win over the section's", () => {
        const one = cue({
            id: "q-one",
            target: { kind: "marcher", marcherId: 7 },
        });
        const cues = [
            resolved(one, 0, 4000),
            resolved(cue({ id: "q-section" }), 0, 4000),
        ];
        expect(findActiveCue(cues, clips, guard, 1000)?.move.id).toBe("q-one");
    });

    it("lists the marchers performing at a time", () => {
        const cues = [resolved(cue(), 0, 4000)];
        const marchers = [guard, { marcherId: 8, section: "Trumpet" }];
        expect([...performingMarcherIds(cues, clips, marchers, 1000)]).toEqual([
            7,
        ]);
        expect(
            performingMarcherIds(cues, clips, marchers, undefined).size,
        ).toBe(0);
    });

    it("stretches the clip over the cue", () => {
        const out = new Float32Array(POSE_SIZE);
        // Halfway through: the middle of the 1 s clip (frame 15)
        performerPose(
            { move: cue(), progress: 0.5, durationSeconds: 8 },
            clips,
            out,
        );
        expect(out[0]).toBeCloseTo(15, 4);
    });

    it("starts from standing", () => {
        const out = new Float32Array(POSE_SIZE);
        performerPose(
            { move: cue(), progress: 0, durationSeconds: 8 },
            clips,
            out,
        );
        out.forEach((value, i) => expect(value).toBeCloseTo(REST_POSE[i], 5));
    });
});

describe("motion cue drafts", () => {
    const clipIds = new Set(["c1"]);
    const page = {
        duration: 8,
        counts: 16,
        beats: Array.from({ length: 16 }, () => ({ duration: 0.5 })),
    } as unknown as Parameters<typeof naturalLengthCounts>[1];

    it("measures a clip's natural length in the page's counts", () => {
        // 4 s at 0.5 s per count
        expect(naturalLengthCounts({ fps: 30, frameCount: 121 }, page, 0)).toBe(
            8,
        );
    });

    it("makes one cue per selected marcher", () => {
        const cues = cuesFromDraft(
            { ...newCueDraft("c1", "selection"), lengthCounts: "4" },
            { pageId: 3, selectedMarcherIds: [1, 2], clipIds },
        );
        expect(cues?.map((made) => made.target)).toEqual([
            { kind: "marcher", marcherId: 1 },
            { kind: "marcher", marcherId: 2 },
        ]);
        expect(cues?.[0]).toMatchObject({ pageId: 3, lengthCounts: 4 });
    });

    it.each([
        ["an unknown clip", { clipId: "nope" }],
        ["a negative start", { startCount: "-1" }],
        ["no length", { lengthCounts: "0" }],
        ["a half-typed length", { lengthCounts: "" }],
        ["no target", { target: "section:" }],
    ])("refuses %s", (_, changes) => {
        expect(
            cuesFromDraft(
                { ...newCueDraft("c1", "section:Color Guard"), ...changes },
                { pageId: 3, selectedMarcherIds: [], clipIds },
            ),
        ).toBeNull();
    });

    it("drops a deleted clip's cues with it", () => {
        const clip = { id: "c1", name: "a", fps: 30, frameCount: 2, data: "" };
        const other = { ...clip, id: "c2" };
        const result = withoutClip(
            {
                clips: [clip, other],
                cues: [cue(), cue({ id: "q2", clipId: "c2" })],
            },
            "c1",
        );
        expect(result.clips.map((kept) => kept.id)).toEqual(["c2"]);
        expect(result.cues.map((kept) => kept.id)).toEqual(["q2"]);
    });
});
