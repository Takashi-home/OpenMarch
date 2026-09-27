/**
 * Heading (yaw) helpers for the 3D view.
 *
 * Yaw is a rotation in radians around the world Y axis. A yaw of 0 faces +Z
 * (toward the audience), and positive yaw turns toward +X, matching three.js
 * `Object3D.rotation.y`.
 */

/** Movement shorter than this (in field pixels) keeps the previous heading. */
export const MIN_HEADING_DISTANCE = 0.5;

/** Wraps an angle into the range (-π, π]. */
export function normalizeAngle(angle: number): number {
    const twoPi = Math.PI * 2;
    let wrapped = angle % twoPi;
    if (wrapped <= -Math.PI) wrapped += twoPi;
    else if (wrapped > Math.PI) wrapped -= twoPi;
    return wrapped;
}

/**
 * Yaw that faces the direction of travel.
 *
 * @param dx - Movement along field X (or world X)
 * @param dz - Movement along field Y (or world Z)
 * @param previousYaw - Returned when the movement is too small to have a direction
 */
export function headingFromDelta(
    dx: number,
    dz: number,
    previousYaw: number,
    minDistance = MIN_HEADING_DISTANCE,
): number {
    if (Math.hypot(dx, dz) < minDistance) return previousYaw;
    return Math.atan2(dx, dz);
}

/**
 * Converts `marcher_pages.rotation_degrees` to yaw.
 *
 * 0 degrees faces the audience, and positive degrees turn clockwise when the
 * field is viewed from above with the audience at the bottom (as in the 2D view).
 */
export function rotationDegreesToYaw(degrees: number): number {
    return normalizeAngle((-degrees * Math.PI) / 180);
}

/**
 * Turns `current` toward `target` by at most `maxStep` radians, taking the
 * shortest direction.
 */
export function dampYaw(
    current: number,
    target: number,
    maxStep: number,
): number {
    const difference = normalizeAngle(target - current);
    if (Math.abs(difference) <= maxStep) return normalizeAngle(target);
    return normalizeAngle(current + Math.sign(difference) * maxStep);
}
