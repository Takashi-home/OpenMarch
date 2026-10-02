// BVH channel names
// cspell:ignore Xposition Yposition Zposition Xrotation Yrotation Zrotation

/**
 * Synthetic BVH files for tests: a standing performer with Mixamo / CMU bone
 * names, offsets in centimeters, +X on the performer's left (facing +Z).
 */

interface BvhJoint {
    name: string;
    offset: [number, number, number];
    children?: BvhJoint[];
    /** End site offset for a joint with no children */
    end?: [number, number, number];
}

const leg = (prefix: "Left" | "Right", sign: 1 | -1): BvhJoint => ({
    name: `${prefix}UpLeg`,
    offset: [10 * sign, 0, 0],
    children: [
        {
            name: `${prefix}Leg`,
            offset: [0, -42, 0],
            children: [
                {
                    name: `${prefix}Foot`,
                    offset: [0, -40, 0],
                    children: [
                        {
                            name: `${prefix}ToeBase`,
                            offset: [0, -5, 12],
                            end: [0, 0, 5],
                        },
                    ],
                },
            ],
        },
    ],
});

const arm = (prefix: "Left" | "Right", sign: 1 | -1): BvhJoint => ({
    name: `${prefix}Arm`,
    offset: [18 * sign, 42, 0],
    children: [
        {
            name: `${prefix}ForeArm`,
            offset: [0, -28, 0],
            children: [
                {
                    name: `${prefix}Hand`,
                    offset: [0, -26, 0],
                    end: [0, -8, 0],
                },
            ],
        },
    ],
});

function skeleton(rename: (name: string) => string): BvhJoint {
    const root: BvhJoint = {
        name: "Hips",
        offset: [0, 0, 0],
        children: [
            {
                name: "Spine",
                offset: [0, 10, 0],
                children: [
                    {
                        name: "Neck",
                        offset: [0, 45, 0],
                        children: [
                            {
                                name: "Head",
                                offset: [0, 10, 0],
                                end: [0, 15, 0],
                            },
                        ],
                    },
                    arm("Left", 1),
                    arm("Right", -1),
                ],
            },
            leg("Left", 1),
            leg("Right", -1),
        ],
    };
    const renameAll = (joint: BvhJoint): BvhJoint => ({
        ...joint,
        name: rename(joint.name),
        children: joint.children?.map(renameAll),
    });
    return renameAll(root);
}

function countJoints(joint: BvhJoint): number {
    return (joint.children ?? []).reduce(
        (sum, child) => sum + countJoints(child),
        1,
    );
}

function hierarchy(joint: BvhJoint, depth: number, isRoot = false): string {
    const pad = "  ".repeat(depth);
    const channels = isRoot
        ? "CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation"
        : "CHANNELS 3 Zrotation Xrotation Yrotation";
    const children = joint.children?.length
        ? joint.children.map((child) => hierarchy(child, depth + 1)).join("\n")
        : [
              `${pad}  End Site`,
              `${pad}  {`,
              `${pad}    OFFSET ${(joint.end ?? [0, 5, 0]).join(" ")}`,
              `${pad}  }`,
          ].join("\n");
    return [
        `${pad}${isRoot ? "ROOT" : "JOINT"} ${joint.name}`,
        `${pad}{`,
        `${pad}  OFFSET ${joint.offset.join(" ")}`,
        `${pad}  ${channels}`,
        children,
        `${pad}}`,
    ].join("\n");
}

/**
 * A BVH whose root walks `travel` cm along X over the clip, turned by
 * `rootRotation` (Z, X, Y degrees) in every frame.
 */
export function makeBvh({
    frames = 61,
    frameTime = 1 / 30,
    travel = 0,
    rootRotation = [0, 0, 0],
    rename = (name) => name,
}: {
    frames?: number;
    frameTime?: number;
    travel?: number;
    rootRotation?: [number, number, number];
    rename?: (name: string) => string;
} = {}): string {
    const root = skeleton(rename);
    const jointRotations = (countJoints(root) - 1) * 3;
    const lines = Array.from({ length: frames }, (_, frame) => {
        const x = (travel * frame) / Math.max(frames - 1, 1);
        return [
            x,
            92,
            0,
            ...rootRotation,
            ...Array<number>(jointRotations).fill(0),
        ].join(" ");
    });
    return [
        "HIERARCHY",
        hierarchy(root, 0, true),
        "MOTION",
        `Frames: ${frames}`,
        `Frame Time: ${frameTime}`,
        ...lines,
    ].join("\n");
}
