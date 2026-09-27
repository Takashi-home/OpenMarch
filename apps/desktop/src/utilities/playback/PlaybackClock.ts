import { getCoordinatesAtTime, MarcherTimeline } from "@/utilities/Keyframes";

/** Marcher positions (field pixels) for one moment of playback. */
export interface PositionFrame {
    timeMilliseconds: number;
    /** Marcher ID to position. Marchers past the end of their timeline are omitted. */
    positions: ReadonlyMap<number, { x: number; y: number }>;
}

/** A view that draws marchers during playback (the 2D canvas, the 3D view, ...). */
export interface PositionSink {
    /**
     * Applies a frame and requests a redraw.
     *
     * @returns false when playback should stop (e.g. a shown marcher has no position)
     */
    apply(frame: PositionFrame): boolean;
}

export interface PlaybackClock {
    /** Adds a sink. Returns a function that removes it. */
    register(sink: PositionSink): () => void;
    /**
     * Computes every marcher's position once and passes it to every sink.
     *
     * @returns false when any sink asks playback to stop
     */
    tick(
        timeMilliseconds: number,
        marcherTimelines: ReadonlyMap<number, MarcherTimeline>,
    ): boolean;
}

/** Computes the positions of every marcher that has a timeline at the given time. */
export function computePositionFrame(
    timeMilliseconds: number,
    marcherTimelines: ReadonlyMap<number, MarcherTimeline>,
): PositionFrame {
    const positions = new Map<number, { x: number; y: number }>();
    for (const [marcherId, timeline] of marcherTimelines) {
        const coords = getCoordinatesAtTime(timeMilliseconds, timeline);
        if (coords) positions.set(marcherId, coords);
    }
    return { timeMilliseconds, positions };
}

export function createPlaybackClock(): PlaybackClock {
    const sinks = new Set<PositionSink>();

    return {
        register(sink) {
            sinks.add(sink);
            return () => {
                sinks.delete(sink);
            };
        },
        tick(timeMilliseconds, marcherTimelines) {
            const frame = computePositionFrame(
                timeMilliseconds,
                marcherTimelines,
            );
            let shouldContinue = true;
            for (const sink of sinks) {
                if (!sink.apply(frame)) shouldContinue = false;
            }
            return shouldContinue;
        },
    };
}

/** The app-wide clock that live playback drives. */
export const playbackClock = createPlaybackClock();
