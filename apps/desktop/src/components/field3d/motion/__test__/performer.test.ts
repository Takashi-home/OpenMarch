import { describe, expect, it } from "vitest";
import { Group, InstancedMesh, Matrix4, Vector3 } from "three";
import { equipmentRig } from "../../scene/equipment";
import { createMarcherAccessories } from "../../scene/marcherAccessories";
import { MARCHER_FIGURE } from "../../scene/marcherGeometry";
import type { DecodedMotionClip } from "../motionClip";
import type { MotionCue, ResolvedMotionCue } from "../motionCues";
import { propHoldMatrix, twoHandWeight } from "../propFrame";
import { JOINT, MotionJoint, POSE_SIZE, REST_POSE } from "../skeleton";

type Point = [number, number, number];

/** The rest pose with some joints moved. */
function poseWith(changes: Partial<Record<MotionJoint, Point>>) {
    const pose = Float32Array.from(REST_POSE);
    for (const [joint, point] of Object.entries(changes) as [
        MotionJoint,
        Point,
    ][])
        pose.set(point, JOINT[joint] * 3);
    return pose;
}

/** The wrist and the hand's tip both at `point`: the hand's center is there. */
const handAt = (side: "left" | "right", point: Point) => ({
    [`${side}Wrist`]: point,
    [`${side}Hand`]: point,
});

const apply = (matrix: Matrix4, point: readonly number[]) =>
    new Vector3(point[0], point[1], point[2]).applyMatrix4(matrix);

const expectNear = (actual: Vector3, expected: Point, digits = 4) => {
    expect(actual.x).toBeCloseTo(expected[0], digits);
    expect(actual.y).toBeCloseTo(expected[1], digits);
    expect(actual.z).toBeCloseTo(expected[2], digits);
};

/** Where the grip and the point one meter up the pole end up. */
function gripAndTip(
    kind: "flag" | "rifle",
    pose: Float32Array,
    propHand: "left" | "right",
) {
    const rig = equipmentRig(kind)!;
    const matrix = propHoldMatrix(kind, pose, propHand, 1, new Matrix4());
    const grip = apply(matrix, rig.grip);
    const tip = apply(
        matrix,
        rig.grip.map((value, i) => value + rig.axis[i]),
    );
    return { grip, direction: tip.sub(grip) };
}

describe("twoHandWeight", () => {
    it("holds with both hands when close, one hand when far apart", () => {
        expect(twoHandWeight(0.3)).toBe(1);
        expect(twoHandWeight(1.2)).toBe(0);
        // Hands touching give no direction
        expect(twoHandWeight(0.01)).toBe(0);
    });
});

describe("propHoldMatrix", () => {
    it("leaves equipment in its hold at the very start of a cue", () => {
        const pose = poseWith(handAt("left", [0.1, 1.3, 0.3]));
        const matrix = propHoldMatrix("flag", pose, "left", 0, new Matrix4());
        expect(matrix.equals(new Matrix4())).toBe(true);
    });

    it("runs a flag pole from the bottom hand through the other", () => {
        const pose = poseWith({
            ...handAt("left", [0.1, 1.0, 0.3]),
            ...handAt("right", [0.1, 1.4, 0.3]),
        });
        const { grip, direction } = gripAndTip("flag", pose, "left");
        expectNear(grip, [0.1, 1.0, 0.3]);
        expectNear(direction, [0, 1, 0]);
    });

    it("lays the pole along the hands when they hold it level", () => {
        const pose = poseWith({
            ...handAt("right", [-0.2, 1.2, 0.3]),
            ...handAt("left", [0.2, 1.2, 0.3]),
        });
        // Right hand at the bottom: the pole points toward the left hand
        const { grip, direction } = gripAndTip("flag", pose, "right");
        expectNear(grip, [-0.2, 1.2, 0.3]);
        expectNear(direction, [1, 0, 0]);
    });

    it("grips a rifle between the hands", () => {
        const pose = poseWith({
            ...handAt("left", [0.1, 1.0, 0.3]),
            ...handAt("right", [-0.1, 1.3, 0.3]),
        });
        expectNear(gripAndTip("rifle", pose, "left").grip, [0, 1.15, 0.3]);
    });

    it("stands the pole across the forearm when held in one hand", () => {
        const pose = poseWith({
            leftElbow: [0.2, 1.0, 0],
            ...handAt("left", [0.5, 1.0, 0]),
            ...handAt("right", [-0.6, 1.0, 0]),
        });
        const { grip, direction } = gripAndTip("flag", pose, "left");
        expectNear(grip, [0.5, 1.0, 0]);
        // The forearm points along +X, so the pole stands straight up
        expectNear(direction, [0, 1, 0]);
    });

    it("moves a drum with the hips", () => {
        const pose = poseWith({ hips: [0, 0.6, 0] });
        const matrix = propHoldMatrix("drum", pose, "left", 1, new Matrix4());
        expectNear(apply(matrix, [0, 0.95, 0.32]), [0, 0.65, 0.32]);
    });

    it("leaves a keyboard where it stands", () => {
        const pose = poseWith({ hips: [0, 0.6, 0] });
        const matrix = propHoldMatrix(
            "keyboard",
            pose,
            "left",
            1,
            new Matrix4(),
        );
        expect(matrix.equals(new Matrix4())).toBe(true);
    });
});

describe("createMarcherAccessories with performers", () => {
    const guard = {
        marcherId: 1,
        section: "Flag",
        color: { r: 0.8, g: 0.1, b: 0.1 },
        equipment: "flag" as const,
    };
    const poses = new Map([[1, { x: 0, z: 0, yaw: 0 }]]);

    /** A clip that holds both hands overhead on the pole. */
    const clip: DecodedMotionClip = (() => {
        const raised = poseWith({
            ...handAt("left", [0.1, 1.9, 0.1]),
            ...handAt("right", [-0.1, 2.1, 0.1]),
        });
        const frames = new Float32Array(POSE_SIZE * 2);
        frames.set(raised, 0);
        frames.set(raised, POSE_SIZE);
        return { id: "c1", fps: 1, frameCount: 2, durationSeconds: 1, frames };
    })();
    const cue: MotionCue = {
        id: "q1",
        clipId: "c1",
        target: { kind: "section", section: "Flag" },
        pageId: 1,
        startCount: 0,
        lengthCounts: 8,
        mirror: false,
        propHand: "left",
    };
    const cues: ResolvedMotionCue[] = [{ move: cue, startMs: 0, endMs: 4000 }];

    const build = () => {
        const accessories = createMarcherAccessories({
            capacity: 4,
            legs: true,
            equipment: true,
            performers: true,
            castShadow: false,
        });
        accessories.setMarchers([guard]);
        accessories.setMotion(cues, new Map([["c1", clip]]));
        return accessories;
    };

    const meshesOfHeight = (object: Group, height: number) =>
        object.children.filter(
            (child): child is InstancedMesh =>
                child instanceof InstancedMesh &&
                (child.geometry.parameters as { height?: number }).height ===
                    height,
        );
    const figureCounts = (object: Group) =>
        (
            object.children.find((child) => child instanceof Group) as Group
        ).children.map((mesh) => (mesh as InstancedMesh).count);
    const legCounts = (object: Group) =>
        meshesOfHeight(object, MARCHER_FIGURE.hipHeight).map(
            (mesh) => mesh.count,
        );

    it("draws a jointed figure, not the walking legs, during a cue", () => {
        const accessories = build();
        accessories.update(poses, 1 / 30, 1, 2000);
        expect(figureCounts(accessories.object).every((n) => n > 0)).toBe(true);
        expect(legCounts(accessories.object)).toEqual([0, 0]);
    });

    it("goes back to the walking figure after the cue", () => {
        const accessories = build();
        accessories.update(poses, 1 / 30, 1, 5000);
        expect(figureCounts(accessories.object).every((n) => n === 0)).toBe(
            true,
        );
        expect(legCounts(accessories.object)).toEqual([1, 1]);
    });

    it("puts the flag in the performer's raised hands", () => {
        const accessories = build();
        accessories.update(poses, 1 / 30, 1, 2000);
        const [pole] = meshesOfHeight(accessories.object, 2.1);
        const matrix = new Matrix4();
        pole.getMatrixAt(0, matrix);
        expectNear(
            apply(matrix, equipmentRig("flag")!.grip),
            [0.1, 1.9, 0.1],
            3,
        );
    });

    it("keeps everyone in their hold without a show time", () => {
        const accessories = build();
        accessories.update(poses, 1 / 30, 1);
        expect(figureCounts(accessories.object).every((n) => n === 0)).toBe(
            true,
        );
    });
});
