import { Matrix4, Quaternion, Vector3 } from "three";
import { bodyLength, JOINT, POSE_SIZE, REST_POSE } from "./skeleton";

/**
 * Turns joint positions sampled from a capture (any units, any up axis, facing
 * any way, wandering around the capture area) into poses the 3D view can play:
 * upright, facing +Z, sized like the figure, standing in place on the ground,
 * with capture jitter smoothed out.
 */

/** How strongly capture jitter is smoothed, as a Gaussian sigma in seconds. */
export const SMOOTHING_SIGMA_SECONDS = {
    none: 0,
    light: 1 / 30,
    medium: 2 / 30,
    strong: 4 / 30,
} as const;
export type MotionSmoothing = keyof typeof SMOOTHING_SIGMA_SECONDS;
export const SMOOTHING_LEVELS = Object.keys(
    SMOOTHING_SIGMA_SECONDS,
) as MotionSmoothing[];

/**
 * Slow wandering of the hips over the capture area is removed so the
 * performer stays on their drill spot; quicker shifts (lunges, steps) stay.
 */
const DRIFT_WINDOW_SECONDS = 1.5;
/** Seconds at the start used to tell which way the performer faces */
const FACING_SECONDS = 0.5;
/** Share of frames whose feet may sink below the floor (capture glitches) */
const FLOOR_PERCENTILE = 0.1;

const REST_ANKLE_HEIGHT = REST_POSE[JOINT.leftAnkle * 3 + 1];
const REST_TOE_HEIGHT = REST_POSE[JOINT.leftToe * 3 + 1];

const frameView = (frames: Float32Array, frame: number) =>
    frames.subarray(frame * POSE_SIZE, (frame + 1) * POSE_SIZE);

const jointVector = (pose: ArrayLike<number>, joint: number, out: Vector3) =>
    out.set(pose[joint * 3], pose[joint * 3 + 1], pose[joint * 3 + 2]);

function applyMatrix(frames: Float32Array, matrix: Matrix4) {
    const point = new Vector3();
    for (let i = 0; i < frames.length; i += 3) {
        point.set(frames[i], frames[i + 1], frames[i + 2]).applyMatrix4(matrix);
        frames[i] = point.x;
        frames[i + 1] = point.y;
        frames[i + 2] = point.z;
    }
}

/** The axis (±X, ±Y or ±Z) pointing from the feet to the head, on average. */
export function captureUpAxis(
    frames: Float32Array,
    frameCount: number,
): Vector3 {
    const sum = new Vector3();
    const head = new Vector3();
    const left = new Vector3();
    const right = new Vector3();
    for (let frame = 0; frame < frameCount; frame++) {
        const pose = frameView(frames, frame);
        jointVector(pose, JOINT.head, head);
        jointVector(pose, JOINT.leftAnkle, left);
        jointVector(pose, JOINT.rightAnkle, right);
        sum.add(head.sub(left.add(right).multiplyScalar(0.5)));
    }
    const components = [sum.x, sum.y, sum.z];
    const axis = components.reduce(
        (best, value, index) =>
            Math.abs(value) > Math.abs(components[best]) ? index : best,
        1,
    );
    const up = new Vector3();
    up.setComponent(axis, Math.sign(components[axis]) || 1);
    return up;
}

/** Turns the capture so its up axis is +Y. */
function makeUpright(frames: Float32Array, frameCount: number) {
    const up = captureUpAxis(frames, frameCount);
    const worldUp = new Vector3(0, 1, 0);
    const turn =
        up.dot(worldUp) < -0.5
            ? // Upside down: no unique shortest turn, so turn about X
              new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI)
            : new Quaternion().setFromUnitVectors(up, worldUp);
    applyMatrix(frames, new Matrix4().makeRotationFromQuaternion(turn));
}

/**
 * Turns the (upright) capture about Y so the performer starts facing +Z: the
 * direction their hips and shoulders face, with +X on their left.
 */
function faceForward(frames: Float32Array, frameCount: number, fps: number) {
    const side = new Vector3();
    const a = new Vector3();
    const b = new Vector3();
    const facingFrames = Math.max(
        1,
        Math.min(frameCount, Math.round(FACING_SECONDS * fps)),
    );
    for (let frame = 0; frame < facingFrames; frame++) {
        const pose = frameView(frames, frame);
        side.add(
            jointVector(pose, JOINT.leftHip, a).sub(
                jointVector(pose, JOINT.rightHip, b),
            ),
        );
        side.add(
            jointVector(pose, JOINT.leftShoulder, a).sub(
                jointVector(pose, JOINT.rightShoulder, b),
            ),
        );
    }
    // With +Y up, left × up points forward
    const forward = side.cross(new Vector3(0, 1, 0));
    if (forward.lengthSq() < 1e-12) return;
    const yaw = Math.atan2(forward.x, forward.z);
    applyMatrix(frames, new Matrix4().makeRotationY(-yaw));
}

function median(values: number[]): number {
    const sorted = [...values].sort((x, y) => x - y);
    return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/** Scales the capture so the performer is as tall as the figure. */
function scaleToFigure(frames: Float32Array, frameCount: number) {
    const lengths = Array.from({ length: frameCount }, (_, frame) =>
        bodyLength(frameView(frames, frame)),
    ).filter((length) => length > 0);
    const captured = median(lengths);
    if (!(captured > 0)) throw new Error("The capture has no body size");
    const scale = bodyLength(REST_POSE) / captured;
    for (let i = 0; i < frames.length; i++) frames[i] *= scale;
}

/**
 * Value `index` of a series of `count`, extended past both ends by point
 * reflection, so a filter keeps a steady drift steady up to the ends.
 */
function reflected(
    read: (index: number) => number,
    count: number,
    index: number,
): number {
    if (count === 1) return read(0);
    const last = count - 1;
    if (index < 0) return 2 * read(0) - read(Math.min(-index, last));
    if (index > last)
        return 2 * read(last) - read(Math.max(2 * last - index, 0));
    return read(index);
}

/** A centered moving average. */
function movingAverage(values: Float64Array, radius: number): Float64Array {
    const out = new Float64Array(values.length);
    const read = (index: number) => values[index];
    for (let i = 0; i < values.length; i++) {
        let sum = 0;
        for (let k = -radius; k <= radius; k++)
            sum += reflected(read, values.length, i + k);
        out[i] = sum / (radius * 2 + 1);
    }
    return out;
}

/**
 * Keeps the performer on their spot: removes the slow wander of the hips over
 * the ground, and starts them centered.
 */
function removeDrift(frames: Float32Array, frameCount: number, fps: number) {
    const radius = Math.max(1, Math.round((DRIFT_WINDOW_SECONDS * fps) / 2));
    for (const axis of [0, 2]) {
        const hips = Float64Array.from({ length: frameCount }, (_, frame) => {
            return frames[frame * POSE_SIZE + JOINT.hips * 3 + axis];
        });
        const drift = movingAverage(hips, radius);
        for (let frame = 0; frame < frameCount; frame++) {
            const offset = frame * POSE_SIZE;
            for (let i = axis; i < POSE_SIZE; i += 3)
                frames[offset + i] -= drift[frame];
        }
    }
}

/** Lifts or lowers the capture so the feet stand on the ground (y = 0). */
function placeOnGround(frames: Float32Array, frameCount: number) {
    const lowest = Array.from({ length: frameCount }, (_, frame) => {
        const pose = frameView(frames, frame);
        const y = (joint: number) => pose[joint * 3 + 1];
        return Math.min(
            y(JOINT.leftAnkle) - REST_ANKLE_HEIGHT,
            y(JOINT.rightAnkle) - REST_ANKLE_HEIGHT,
            y(JOINT.leftToe) - REST_TOE_HEIGHT,
            y(JOINT.rightToe) - REST_TOE_HEIGHT,
        );
    }).sort((x, y) => x - y);
    const floor =
        lowest[
            Math.min(Math.floor(frameCount * FLOOR_PERCENTILE), frameCount - 1)
        ];
    for (let i = 1; i < frames.length; i += 3) frames[i] -= floor;
}

/** Smooths every coordinate over time with a Gaussian of `sigma` frames. */
export function smoothFrames(
    frames: Float32Array,
    frameCount: number,
    sigmaFrames: number,
): void {
    if (sigmaFrames <= 0 || frameCount < 3) return;
    const radius = Math.ceil(sigmaFrames * 3);
    const weights = Array.from({ length: radius * 2 + 1 }, (_, i) =>
        Math.exp(-((i - radius) ** 2) / (2 * sigmaFrames ** 2)),
    );
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    const source = Float32Array.from(frames);
    for (let i = 0; i < POSE_SIZE; i++) {
        const read = (frame: number) => source[frame * POSE_SIZE + i];
        for (let frame = 0; frame < frameCount; frame++) {
            let sum = 0;
            for (let k = -radius; k <= radius; k++)
                sum +=
                    reflected(read, frameCount, frame + k) *
                    weights[k + radius];
            frames[frame * POSE_SIZE + i] = sum / total;
        }
    }
}

/**
 * Normalizes captured joint positions in place (see the top of this file).
 *
 * @param frames - `frameCount` poses of `POSE_SIZE` numbers, as captured
 */
export function normalizeMotion(
    frames: Float32Array,
    frameCount: number,
    fps: number,
    smoothing: MotionSmoothing,
): Float32Array {
    if (frameCount < 1 || frames.length < frameCount * POSE_SIZE)
        throw new Error("The capture has no frames");
    makeUpright(frames, frameCount);
    faceForward(frames, frameCount, fps);
    scaleToFigure(frames, frameCount);
    removeDrift(frames, frameCount, fps);
    placeOnGround(frames, frameCount);
    smoothFrames(frames, frameCount, SMOOTHING_SIGMA_SECONDS[smoothing] * fps);
    return frames;
}
