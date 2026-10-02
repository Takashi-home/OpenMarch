/**
 * The joints a performer's motion is stored and drawn with. Any rig a motion
 * capture tool exports (BVH, glTF, FBX) is reduced to these points, so a clip
 * never depends on the bone names or rest pose of the tool that made it.
 *
 * Positions are in the marcher's own space, in meters: +Y is up, +Z is the way
 * the marcher faces and +X is the marcher's left. The origin is on the ground
 * under the hips.
 */
export const MOTION_JOINTS = [
    "hips",
    "neck",
    "head",
    "leftShoulder",
    "leftElbow",
    "leftWrist",
    "leftHand",
    "rightShoulder",
    "rightElbow",
    "rightWrist",
    "rightHand",
    "leftHip",
    "leftKnee",
    "leftAnkle",
    "leftToe",
    "rightHip",
    "rightKnee",
    "rightAnkle",
    "rightToe",
] as const;
export type MotionJoint = (typeof MOTION_JOINTS)[number];

export const JOINT_COUNT = MOTION_JOINTS.length;
/** Numbers per pose: x, y, z for every joint */
export const POSE_SIZE = JOINT_COUNT * 3;

/** Index of each joint in a pose */
export const JOINT = Object.fromEntries(
    MOTION_JOINTS.map((joint, index) => [joint, index]),
) as Record<MotionJoint, number>;

/** Joint positions, `POSE_SIZE` numbers in `MOTION_JOINTS` order. */
export type Pose = Float32Array;

/** Each left joint with its right counterpart, for mirroring. */
export const MIRRORED_JOINTS: readonly (readonly [number, number])[] =
    MOTION_JOINTS.flatMap((joint, index) =>
        joint.startsWith("left")
            ? [
                  [
                      index,
                      JOINT[joint.replace("left", "right") as MotionJoint],
                  ] as const,
              ]
            : [],
    );

const REST: Record<MotionJoint, readonly [number, number, number]> = {
    hips: [0, 0.9, 0],
    neck: [0, 1.45, 0],
    head: [0, 1.55, 0],
    leftShoulder: [0.19, 1.42, 0],
    leftElbow: [0.21, 1.13, 0],
    leftWrist: [0.22, 0.87, 0.02],
    leftHand: [0.22, 0.78, 0.04],
    rightShoulder: [-0.19, 1.42, 0],
    rightElbow: [-0.21, 1.13, 0],
    rightWrist: [-0.22, 0.87, 0.02],
    rightHand: [-0.22, 0.78, 0.04],
    leftHip: [0.1, 0.9, 0],
    leftKnee: [0.1, 0.49, 0.01],
    leftAnkle: [0.1, 0.08, 0],
    leftToe: [0.1, 0.03, 0.14],
    rightHip: [-0.1, 0.9, 0],
    rightKnee: [-0.1, 0.49, 0.01],
    rightAnkle: [-0.1, 0.08, 0],
    rightToe: [-0.1, 0.03, 0.14],
};

/**
 * Standing at attention, about as tall as the "figure" model. Clips blend from
 * and back to this pose, and are scaled to its proportions.
 */
export const REST_POSE: Pose = Float32Array.from(
    MOTION_JOINTS.flatMap((joint) => REST[joint]),
);

/** Distance between two joints of a pose. */
export function jointDistance(
    pose: ArrayLike<number>,
    a: number,
    b: number,
): number {
    return Math.hypot(
        pose[a * 3] - pose[b * 3],
        pose[a * 3 + 1] - pose[b * 3 + 1],
        pose[a * 3 + 2] - pose[b * 3 + 2],
    );
}

/**
 * Body proportions used to scale a captured performer to the figure: from the
 * hips up to the neck, and both legs from hip to ankle.
 */
const BODY_LENGTH_SEGMENTS: readonly (readonly [number, number])[] = [
    [JOINT.hips, JOINT.neck],
    [JOINT.leftHip, JOINT.leftKnee],
    [JOINT.leftKnee, JOINT.leftAnkle],
    [JOINT.rightHip, JOINT.rightKnee],
    [JOINT.rightKnee, JOINT.rightAnkle],
];

/** Sum of the body length segments of a pose. */
export function bodyLength(pose: ArrayLike<number>): number {
    return BODY_LENGTH_SEGMENTS.reduce(
        (sum, [a, b]) => sum + jointDistance(pose, a, b),
        0,
    );
}
