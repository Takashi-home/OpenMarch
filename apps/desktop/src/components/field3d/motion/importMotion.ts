import {
    AnimationClip,
    AnimationMixer,
    LoopOnce,
    Object3D,
    Vector3,
} from "three";
import { matchBones, REQUIRED_ROLES, RoleKey } from "./boneNames";
import {
    encodeMotionFrames,
    MAX_CLIP_SECONDS,
    MotionClip,
    MOTION_FPS,
    newMotionId,
} from "./motionClip";
import { MotionSmoothing, normalizeMotion } from "./normalizeMotion";
import { JOINT, MotionJoint, POSE_SIZE } from "./skeleton";

/**
 * Imports a performer's motion from the files motion capture and 3D tools
 * export: BVH (webcam capture tools such as XR Animator, MocapForAll, Rokoko
 * Video, and Blender), glTF / GLB (Blender, VRM tools) and FBX (Mixamo).
 */

export const MOTION_FILE_EXTENSIONS = [".bvh", ".glb", ".gltf", ".fbx"];

/** Why a file could not be imported, as a translation key and its values. */
export class MotionImportError extends Error {
    constructor(
        readonly reason:
            | "unsupported"
            | "noAnimation"
            | "missingBones"
            | "tooLong"
            | "unreadable",
        readonly details: Record<string, string | number> = {},
    ) {
        super(`Motion import failed: ${reason} ${JSON.stringify(details)}`);
        this.name = "MotionImportError";
    }
}

/** A rig with its animation, as a loader returns it. */
export interface LoadedRig {
    root: Object3D;
    clip: AnimationClip;
}

const extensionOf = (fileName: string) =>
    fileName.slice(fileName.lastIndexOf(".")).toLowerCase();

/** The longest animation, which is the performance in most exports. */
function longestClip(clips: readonly AnimationClip[]): AnimationClip {
    const clip = [...clips].sort((a, b) => b.duration - a.duration)[0];
    if (!clip || clip.duration <= 0) throw new MotionImportError("noAnimation");
    return clip;
}

/** Reads a file into a rig and its animation with three.js's loaders. */
export async function loadRig(
    fileName: string,
    bytes: ArrayBuffer,
): Promise<LoadedRig> {
    switch (extensionOf(fileName)) {
        case ".bvh": {
            const { BVHLoader } =
                await import("three/examples/jsm/loaders/BVHLoader.js");
            const text = new TextDecoder().decode(bytes);
            const { skeleton, clip } = new BVHLoader().parse(text);
            const root = skeleton.bones[0];
            if (!root) throw new MotionImportError("noAnimation");
            // The BVH clip's duration is -1 until it is measured
            clip.resetDuration();
            return { root, clip: longestClip([clip]) };
        }
        case ".glb":
        case ".gltf": {
            const { GLTFLoader } =
                await import("three/examples/jsm/loaders/GLTFLoader.js");
            const gltf = await new GLTFLoader().parseAsync(bytes, "");
            return { root: gltf.scene, clip: longestClip(gltf.animations) };
        }
        case ".fbx": {
            const { FBXLoader } =
                await import("three/examples/jsm/loaders/FBXLoader.js");
            const group = new FBXLoader().parse(bytes, "");
            return { root: group, clip: longestClip(group.animations) };
        }
        default:
            throw new MotionImportError("unsupported", {
                extension: extensionOf(fileName),
            });
    }
}

/** Joints read straight from a matched bone. */
const BONE_FOR_JOINT: Partial<Record<MotionJoint, RoleKey>> = {
    leftShoulder: "left.upperArm",
    leftElbow: "left.elbow",
    leftWrist: "left.wrist",
    rightShoulder: "right.upperArm",
    rightElbow: "right.elbow",
    rightWrist: "right.wrist",
    leftHip: "left.hip",
    leftKnee: "left.knee",
    leftAnkle: "left.ankle",
    rightHip: "right.hip",
    rightKnee: "right.knee",
    rightAnkle: "right.ankle",
    neck: "neck",
    head: "head",
    leftToe: "left.toe",
    rightToe: "right.toe",
};

/** The rig nodes read each frame. */
interface RigJoints {
    nodes: Map<MotionJoint, Object3D>;
    /** The first child of each wrist, for the hand's direction */
    handTips: Map<"left" | "right", Object3D>;
}

function findRigJoints(root: Object3D): RigJoints {
    const all: Object3D[] = [];
    root.traverse((node) => {
        if (node.name) all.push(node);
    });
    // Bone names win over meshes or helpers that happen to share them
    const bones = all.filter((node) => (node as { isBone?: boolean }).isBone);
    const matched = matchBones(bones.length > 0 ? bones : all);

    const missing = REQUIRED_ROLES.filter((role) => !matched.has(role));
    if (missing.length > 0)
        throw new MotionImportError("missingBones", {
            bones: missing.join(", "),
        });

    const nodes = new Map<MotionJoint, Object3D>();
    for (const [joint, role] of Object.entries(BONE_FOR_JOINT) as [
        MotionJoint,
        RoleKey,
    ][]) {
        const node = matched.get(role);
        if (node) nodes.set(joint, node);
    }
    const handTips = new Map<"left" | "right", Object3D>();
    for (const side of ["left", "right"] as const) {
        const children = matched.get(`${side}.wrist`)?.children ?? [];
        // The middle finger points along the hand; the thumb does not
        const tip =
            children.find((child) => /middle|中指/i.test(child.name)) ??
            children.find((child) => /index|人指|人差/i.test(child.name)) ??
            children.find((child) => !/thumb|親指/i.test(child.name)) ??
            children[0];
        if (tip) handTips.set(side, tip);
    }
    return { nodes, handTips };
}

const scratch = new Vector3();
const scratchB = new Vector3();

function setJoint(pose: Float32Array, joint: MotionJoint, point: Vector3) {
    pose[JOINT[joint] * 3] = point.x;
    pose[JOINT[joint] * 3 + 1] = point.y;
    pose[JOINT[joint] * 3 + 2] = point.z;
}

function getJoint(pose: Float32Array, joint: MotionJoint, out: Vector3) {
    return out.set(
        pose[JOINT[joint] * 3],
        pose[JOINT[joint] * 3 + 1],
        pose[JOINT[joint] * 3 + 2],
    );
}

const midpoint = (pose: Float32Array, a: MotionJoint, b: MotionJoint) =>
    getJoint(pose, a, new Vector3())
        .add(getJoint(pose, b, scratchB))
        .multiplyScalar(0.5);

/** Fills in the hands and toes from the wrists and ankles. */
function readExtremities(rig: RigJoints, pose: Float32Array) {
    for (const side of ["left", "right"] as const) {
        const wrist = getJoint(pose, `${side}Wrist`, new Vector3());
        const tip = rig.handTips.get(side);
        // Without fingers, the hand continues past the wrist along the forearm
        const hand = tip
            ? tip.getWorldPosition(new Vector3())
            : wrist
                  .clone()
                  .addScaledVector(
                      wrist
                          .clone()
                          .sub(getJoint(pose, `${side}Elbow`, scratch)),
                      0.35,
                  );
        setJoint(pose, `${side}Hand`, hand);

        if (!rig.nodes.has(`${side}Toe`)) {
            // Without toes, a point just below the ankle keeps the foot drawn
            const ankle = getJoint(pose, `${side}Ankle`, new Vector3());
            const shin = getJoint(pose, `${side}Knee`, scratch).sub(ankle);
            setJoint(
                pose,
                `${side}Toe`,
                ankle.addScaledVector(shin.normalize(), -0.05),
            );
        }
    }
}

/** Reads one frame of the (already posed) rig into `pose`. */
function readPose(rig: RigJoints, pose: Float32Array) {
    for (const [joint, node] of rig.nodes)
        setJoint(pose, joint, node.getWorldPosition(scratch));

    // Hips: between the hip joints, the same point on every rig
    setJoint(pose, "hips", midpoint(pose, "leftHip", "rightHip"));
    if (!rig.nodes.has("neck"))
        setJoint(pose, "neck", midpoint(pose, "leftShoulder", "rightShoulder"));
    if (!rig.nodes.has("head")) {
        // A head's length above the neck, along the spine
        const neck = getJoint(pose, "neck", new Vector3());
        const spine = neck.clone().sub(getJoint(pose, "hips", scratch));
        setJoint(pose, "head", neck.addScaledVector(spine, 0.2));
    }
    readExtremities(rig, pose);
}

/**
 * Plays the rig's animation and records joint positions at `fps`.
 *
 * @returns Raw poses in the file's own units and axes, and the frame count
 */
export function sampleRig(
    { root, clip }: LoadedRig,
    fps: number,
): { frames: Float32Array; frameCount: number } {
    if (clip.duration > MAX_CLIP_SECONDS)
        throw new MotionImportError("tooLong", {
            seconds: Math.round(clip.duration),
            max: MAX_CLIP_SECONDS,
        });
    const rig = findRigJoints(root);
    const frameCount = Math.max(1, Math.floor(clip.duration * fps) + 1);
    const frames = new Float32Array(frameCount * POSE_SIZE);

    const mixer = new AnimationMixer(root);
    // Played once and held, so the last frame is the clip's end, not its start
    const action = mixer.clipAction(clip).setLoop(LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    for (let frame = 0; frame < frameCount; frame++) {
        mixer.setTime(Math.min(frame / fps, clip.duration));
        root.updateMatrixWorld(true);
        readPose(rig, frames.subarray(frame * POSE_SIZE));
    }
    mixer.stopAllAction();
    mixer.uncacheRoot(root);
    return { frames, frameCount };
}

/**
 * Reads a motion file into a clip for the show: sampled at `MOTION_FPS`,
 * normalized to the figure and smoothed.
 */
export async function importMotionFile(
    fileName: string,
    bytes: ArrayBuffer,
    smoothing: MotionSmoothing,
): Promise<MotionClip> {
    let rig: LoadedRig;
    try {
        rig = await loadRig(fileName, bytes);
    } catch (error) {
        if (error instanceof MotionImportError) throw error;
        throw new MotionImportError("unreadable", {
            message: error instanceof Error ? error.message : String(error),
        });
    }
    const { frames, frameCount } = sampleRig(rig, MOTION_FPS);
    normalizeMotion(frames, frameCount, MOTION_FPS, smoothing);
    return {
        id: newMotionId("c"),
        name: fileName,
        fps: MOTION_FPS,
        frameCount,
        data: encodeMotionFrames(frames),
    };
}
