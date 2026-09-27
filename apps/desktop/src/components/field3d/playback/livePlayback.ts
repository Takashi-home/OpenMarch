import type {
    PositionFrame,
    PositionSink,
} from "@/utilities/playback/PlaybackClock";
import { dampYaw, normalizeAngle } from "../coords/heading";

/**
 * A playback sink for the 3D view. It only keeps the latest frame; the R3F
 * render loop reads it with {@link LivePositionStore.latest} and moves the
 * marchers, so the 3D view never re-renders React during playback.
 */
export interface LivePositionStore extends PositionSink {
    /** The most recent frame, or null before the first one arrives */
    latest(): PositionFrame | null;
    /** Forgets the stored frame (e.g. when playback stops) */
    reset(): void;
}

export function createLivePositionStore(): LivePositionStore {
    let latestFrame: PositionFrame | null = null;
    return {
        apply(frame) {
            latestFrame = frame;
            // Ending playback is decided by the 2D canvas, which knows which
            // marchers are shown; the 3D view never stops it on its own.
            return true;
        },
        latest: () => latestFrame,
        reset() {
            latestFrame = null;
        },
    };
}

/** Distance (meters) a marcher must cover before its facing is updated. */
export const HEADING_ANCHOR_DISTANCE = 0.1;
/** Fastest turn, in radians per second, so direction changes look smooth. */
export const MAX_TURN_RATE = Math.PI * 3;

export interface HeadingTracker {
    /**
     * Returns the yaw for a marcher at a new world position.
     *
     * The marcher faces its direction of travel once it has moved at least
     * {@link HEADING_ANCHOR_DISTANCE} from where its heading was last set, so
     * marking time or tiny moves keep the previous facing. Turning is limited
     * to {@link MAX_TURN_RATE}.
     *
     * @param initialYaw - Facing to start from the first time a marcher is seen
     * @param deltaSeconds - Time since the previous update, for turn damping
     */
    update(
        marcherId: number,
        x: number,
        z: number,
        initialYaw: number,
        deltaSeconds: number,
    ): number;
    /** Forgets every marcher (e.g. when playback starts again) */
    reset(): void;
}

interface HeadingState {
    anchorX: number;
    anchorZ: number;
    targetYaw: number;
    yaw: number;
}

export function createHeadingTracker({
    anchorDistance = HEADING_ANCHOR_DISTANCE,
    maxTurnRate = MAX_TURN_RATE,
}: { anchorDistance?: number; maxTurnRate?: number } = {}): HeadingTracker {
    const states = new Map<number, HeadingState>();

    return {
        update(marcherId, x, z, initialYaw, deltaSeconds) {
            let state = states.get(marcherId);
            if (!state) {
                const yaw = normalizeAngle(initialYaw);
                state = { anchorX: x, anchorZ: z, targetYaw: yaw, yaw };
                states.set(marcherId, state);
                return yaw;
            }

            const dx = x - state.anchorX;
            const dz = z - state.anchorZ;
            if (Math.hypot(dx, dz) >= anchorDistance) {
                state.targetYaw = Math.atan2(dx, dz);
                state.anchorX = x;
                state.anchorZ = z;
            }

            state.yaw = dampYaw(
                state.yaw,
                state.targetYaw,
                maxTurnRate * Math.max(deltaSeconds, 0),
            );
            return state.yaw;
        },
        reset() {
            states.clear();
        },
    };
}

export interface MarcherPose {
    x: number;
    z: number;
    yaw: number;
}

/** How long paused page changes glide from the old spot to the new one. */
export const PAGE_TRANSITION_SECONDS = 0.15;

/**
 * Pose between `from` and `to` at `progress` (0–1), eased and turning the
 * short way round.
 */
export function interpolatePose(
    from: MarcherPose,
    to: MarcherPose,
    progress: number,
): MarcherPose {
    const t = Math.min(Math.max(progress, 0), 1);
    // Ease in-out so the glide starts and settles gently
    const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    return {
        x: from.x + (to.x - from.x) * eased,
        z: from.z + (to.z - from.z) * eased,
        yaw: normalizeAngle(
            from.yaw + normalizeAngle(to.yaw - from.yaw) * eased,
        ),
    };
}
