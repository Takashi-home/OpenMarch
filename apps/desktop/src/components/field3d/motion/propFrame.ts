import { Matrix4, Quaternion, Vector3 } from "three";
import { EquipmentKind, equipmentRig } from "../scene/equipment";
import type { PropHand } from "./motionCues";
import { JOINT, MotionJoint, Pose, REST_POSE } from "./skeleton";

/**
 * Where a performer's equipment goes while they play a motion clip. Captures
 * record the body, not the flag or rifle, so the equipment follows the hands:
 *
 * - Hands close together (both on the pole): the pole runs from the bottom
 *   hand through the other hand.
 * - One hand: the pole stands in that hand across the forearm, as upright as
 *   the arm allows.
 *
 * Between the two, the direction blends with the distance between the hands,
 * so a hand letting go of the pole does not make it jump.
 */

/** Hands nearer than this hold the pole together */
const TWO_HAND_FULL = 0.45;
/** Hands farther apart than this hold it in one hand */
const ONE_HAND_FULL = 0.8;
/** Hands nearly touching give no direction, so one hand leads again */
const HANDS_TOGETHER = 0.03;
const HANDS_TOGETHER_BLEND = 0.07;

const smoothstep = (value: number) => {
    const t = Math.min(Math.max(value, 0), 1);
    return t * t * (3 - 2 * t);
};

const UP = new Vector3(0, 1, 0);
const FORWARD = new Vector3(0, 0, 1);

const joint = (pose: Pose, name: MotionJoint, out: Vector3) =>
    out.set(
        pose[JOINT[name] * 3],
        pose[JOINT[name] * 3 + 1],
        pose[JOINT[name] * 3 + 2],
    );

const s = {
    a: new Vector3(),
    b: new Vector3(),
    bottom: new Vector3(),
    other: new Vector3(),
    twoAxis: new Vector3(),
    oneAxis: new Vector3(),
    axis: new Vector3(),
    forward: new Vector3(),
    normal: new Vector3(),
    side: new Vector3(),
    restAxis: new Vector3(),
    restNormal: new Vector3(),
    restSide: new Vector3(),
    held: new Matrix4(),
    rest: new Matrix4(),
    shift: new Matrix4(),
    identity: new Quaternion(),
};

/** A piece of equipment turned by `rotation` and moved so `pivot` is at `to`. */
interface Hold {
    pivot: Vector3;
    to: Vector3;
    rotation: Quaternion;
}
const hold: Hold = {
    pivot: new Vector3(),
    to: new Vector3(),
    rotation: new Quaternion(),
};

/** The middle of a hand: between the wrist and the hand's tip. */
function handCenter(pose: Pose, side: PropHand, out: Vector3) {
    return joint(pose, `${side}Wrist`, out)
        .add(joint(pose, `${side}Hand`, s.a))
        .multiplyScalar(0.5);
}

/** The way the body faces (hips and shoulders), flat on the ground. */
export function bodyForward(pose: Pose, out: Vector3): Vector3 {
    out.copy(joint(pose, "leftHip", s.a).sub(joint(pose, "rightHip", s.b)));
    out.add(
        joint(pose, "leftShoulder", s.a).sub(joint(pose, "rightShoulder", s.b)),
    );
    // With +Y up, left × up points forward
    out.cross(UP).setY(0);
    return out.lengthSq() > 1e-8 ? out.normalize() : out.copy(FORWARD);
}

/** `v` with its part along unit vector `axis` removed, normalized (or null). */
function perpendicular(v: Vector3, axis: Vector3, out: Vector3) {
    out.copy(v).addScaledVector(axis, -v.dot(axis));
    return out.lengthSq() > 0.04 ? out.normalize() : null;
}

/** How much the hands hold the pole together (1) rather than one hand (0). */
export function twoHandWeight(apart: number): number {
    return (
        (1 -
            smoothstep(
                (apart - TWO_HAND_FULL) / (ONE_HAND_FULL - TWO_HAND_FULL),
            )) *
        smoothstep((apart - HANDS_TOGETHER) / HANDS_TOGETHER_BLEND)
    );
}

/** Sets `hold.to` (the grip) and `s.axis` (unit) from the hands. */
function gripFromHands(
    pose: Pose,
    propHand: PropHand,
    twoHandGrip: "bottom" | "middle",
) {
    const { bottom, other, twoAxis, oneAxis, axis } = s;
    handCenter(pose, propHand, bottom);
    handCenter(pose, propHand === "left" ? "right" : "left", other);
    const twoHands = twoHandWeight(bottom.distanceTo(other));
    twoAxis.copy(other).sub(bottom).normalize();

    // One hand: across the forearm, as upright as it can be
    const forearm = joint(pose, `${propHand}Wrist`, s.a)
        .sub(joint(pose, `${propHand}Elbow`, s.b))
        .normalize();
    if (
        !perpendicular(UP, forearm, oneAxis) &&
        // Arm straight up or down: lean the pole the way the body faces
        !perpendicular(bodyForward(pose, s.forward), forearm, oneAxis)
    )
        oneAxis.copy(UP);

    axis.copy(oneAxis).multiplyScalar(1 - twoHands);
    axis.addScaledVector(twoAxis, twoHands);
    if (axis.lengthSq() < 1e-6) axis.copy(twoHands >= 0.5 ? twoAxis : oneAxis);
    axis.normalize();

    hold.to.copy(bottom);
    if (twoHandGrip === "middle")
        hold.to.lerp(other.add(bottom).multiplyScalar(0.5), twoHands);
}

/** In the hands: the pole along the hands, the silk facing out. */
function handHold(
    kind: EquipmentKind,
    pose: Pose,
    propHand: PropHand,
): Hold | null {
    const rig = equipmentRig(kind);
    if (!rig) return null;
    gripFromHands(pose, propHand, rig.twoHandGrip);

    // The silk or sling faces the way the body faces, as far as the pole allows
    if (
        !perpendicular(bodyForward(pose, s.forward), s.axis, s.normal) &&
        !perpendicular(UP, s.axis, s.normal)
    )
        s.normal.copy(FORWARD);
    s.side.crossVectors(s.axis, s.normal);

    s.restAxis.set(...rig.axis);
    s.restNormal.copy(FORWARD);
    s.restSide.crossVectors(s.restAxis, s.restNormal);

    // The turn taking the rest frame onto the held frame
    s.held.makeBasis(s.side, s.axis, s.normal);
    s.rest.makeBasis(s.restSide, s.restAxis, s.restNormal).transpose();
    hold.rotation.setFromRotationMatrix(s.held.multiply(s.rest));
    hold.pivot.set(...rig.grip);
    return hold;
}

/** At the waist: moves with the hips and turns as the body turns (a drum). */
function bodyHold(pose: Pose): Hold {
    const forward = bodyForward(pose, s.forward);
    hold.rotation.setFromAxisAngle(UP, Math.atan2(forward.x, forward.z));
    joint(REST_POSE, "hips", hold.pivot);
    joint(pose, "hips", hold.to);
    return hold;
}

/**
 * The matrix taking a piece of equipment from its usual hold (the rest
 * geometry) to where the performer holds it, in the marcher's space. Blended
 * with the usual hold by `weight`, the same easing as the body, so it moves
 * into the hands as the cue starts and back as it ends, turning about the grip.
 *
 * @returns `out`; the identity for equipment that stays put (a keyboard)
 */
export function propHoldMatrix(
    kind: EquipmentKind,
    pose: Pose,
    propHand: PropHand,
    weight: number,
    out: Matrix4,
): Matrix4 {
    const held =
        kind === "drum"
            ? bodyHold(pose)
            : kind === "keyboard"
              ? null
              : handHold(kind, pose, propHand);
    if (!held) return out.identity();

    const w = Math.min(Math.max(weight, 0), 1);
    const to = s.a.copy(held.pivot).lerp(held.to, w);
    const rotation = held.rotation.slerp(s.identity, 1 - w);
    out.makeTranslation(-held.pivot.x, -held.pivot.y, -held.pivot.z);
    out.premultiply(s.shift.makeRotationFromQuaternion(rotation));
    return out.premultiply(s.shift.makeTranslation(to.x, to.y, to.z));
}
