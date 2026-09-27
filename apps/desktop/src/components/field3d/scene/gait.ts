/**
 * Leg swing for walking marchers. The swing follows the distance each marcher
 * covers, so feet keep pace with the drill whatever the tempo, and fades out
 * when a marcher stands still (a halt or mark time).
 */

/** Length of one step in meters (an 8-to-5 step, 22.5 inches). */
export const STEP_METERS = 0.5715;
/** Largest leg swing either side of vertical, in radians. */
export const MAX_SWING = 0.45;
/** Speed (m/s) at which the swing reaches its full size. */
export const FULL_SWING_SPEED = 1.2;
/** How quickly the swing size follows the speed (1/seconds). */
const SWING_RESPONSE = 10;
/** Moves longer than this in one update are jumps (page changes), not steps. */
const MAX_STEP_DISTANCE = 2;
/** Longest time step used, so a stalled frame does not look like a sprint. */
const MAX_DELTA_SECONDS = 0.1;
/** Swing below this counts as standing still. */
const SETTLED_SWING = 0.005;

interface GaitState {
    x: number;
    z: number;
    /** Walk cycle angle; one full turn is two steps */
    phase: number;
    /** Current swing size in radians */
    amplitude: number;
}

export interface GaitTracker {
    /**
     * Advances a marcher's walk to its new position.
     *
     * @returns The leg swing in radians: positive swings the left leg forward
     */
    update(
        marcherId: number,
        x: number,
        z: number,
        deltaSeconds: number,
    ): number;
    /** Whether every marcher has stopped swinging */
    isSettled(): boolean;
    reset(): void;
}

export function createGaitTracker(): GaitTracker {
    const states = new Map<number, GaitState>();

    return {
        update(marcherId, x, z, deltaSeconds) {
            const state = states.get(marcherId);
            if (!state) {
                states.set(marcherId, { x, z, phase: 0, amplitude: 0 });
                return 0;
            }
            const dt = Math.min(Math.max(deltaSeconds, 0), MAX_DELTA_SECONDS);
            let distance = Math.hypot(x - state.x, z - state.z);
            if (distance > MAX_STEP_DISTANCE) distance = 0;
            state.x = x;
            state.z = z;
            if (dt === 0) return Math.sin(state.phase) * state.amplitude;

            state.phase =
                (state.phase + (distance / STEP_METERS) * Math.PI) %
                (Math.PI * 2);
            const speed = distance / dt;
            const target = Math.min(speed / FULL_SWING_SPEED, 1) * MAX_SWING;
            state.amplitude +=
                (target - state.amplitude) *
                (1 - Math.exp(-SWING_RESPONSE * dt));
            if (state.amplitude < SETTLED_SWING && target === 0)
                state.amplitude = 0;
            return Math.sin(state.phase) * state.amplitude;
        },
        isSettled() {
            for (const state of states.values())
                if (state.amplitude >= SETTLED_SWING) return false;
            return true;
        },
        reset() {
            states.clear();
        },
    };
}
