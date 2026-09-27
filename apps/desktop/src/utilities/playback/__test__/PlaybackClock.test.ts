import { describe, expect, it, vi } from "vitest";
import { CoordinateDefinition, MarcherTimeline } from "@/utilities/Keyframes";
import {
    computePositionFrame,
    createPlaybackClock,
    PositionFrame,
    PositionSink,
} from "../PlaybackClock";
import { createFabricPositionSink } from "../fabricPositionSink";

const timeline = (
    keyframes: [number, CoordinateDefinition][],
): MarcherTimeline => ({
    pathMap: new Map(keyframes),
    sortedTimestamps: keyframes.map(([time]) => time),
});

const timelines = new Map<number, MarcherTimeline>([
    [
        1,
        timeline([
            [0, { x: 0, y: 0 }],
            [1000, { x: 100, y: 50 }],
        ]),
    ],
    [
        2,
        timeline([
            [0, { x: 10, y: 10 }],
            [2000, { x: 10, y: 30 }],
        ]),
    ],
]);

const recordingSink = (result = true) => {
    const frames: PositionFrame[] = [];
    const sink: PositionSink = {
        apply: (frame) => {
            frames.push(frame);
            return result;
        },
    };
    return { sink, frames };
};

describe("computePositionFrame", () => {
    it("interpolates every marcher that has a timeline", () => {
        const frame = computePositionFrame(500, timelines);
        expect(frame.timeMilliseconds).toBe(500);
        expect(frame.positions.get(1)).toEqual({ x: 50, y: 25 });
        expect(frame.positions.get(2)).toEqual({ x: 10, y: 15 });
    });

    it("omits marchers past the end of their timeline", () => {
        const frame = computePositionFrame(1500, timelines);
        expect(frame.positions.has(1)).toBe(false);
        expect(frame.positions.get(2)).toEqual({ x: 10, y: 25 });
    });
});

describe("createPlaybackClock", () => {
    it("sends the same frame to every registered sink", () => {
        const clock = createPlaybackClock();
        const first = recordingSink();
        const second = recordingSink();
        clock.register(first.sink);
        clock.register(second.sink);

        expect(clock.tick(500, timelines)).toBe(true);
        expect(first.frames).toHaveLength(1);
        expect(second.frames).toHaveLength(1);
        expect(first.frames[0]).toBe(second.frames[0]);
    });

    it("stops sending frames to a sink after it unregisters", () => {
        const clock = createPlaybackClock();
        const { sink, frames } = recordingSink();
        const unregister = clock.register(sink);

        clock.tick(100, timelines);
        unregister();
        clock.tick(200, timelines);

        expect(frames.map((frame) => frame.timeMilliseconds)).toEqual([100]);
    });

    it("returns false when any sink asks to stop, but still updates every sink", () => {
        const clock = createPlaybackClock();
        const stopping = recordingSink(false);
        const continuing = recordingSink(true);
        clock.register(stopping.sink);
        clock.register(continuing.sink);

        expect(clock.tick(500, timelines)).toBe(false);
        expect(continuing.frames).toHaveLength(1);
    });

    it("keeps going with no sinks registered", () => {
        expect(createPlaybackClock().tick(500, timelines)).toBe(true);
    });
});

describe("createFabricPositionSink", () => {
    const fakeCanvas = (marcherIds: number[]) => {
        const canvasMarchers = marcherIds.map((id) => ({
            marcherObj: { id },
            setLiveCoordinates: vi.fn(),
        }));
        const canvas = {
            getCanvasMarchers: () => canvasMarchers,
            requestRenderAll: vi.fn(),
        };
        return {
            canvasMarchers,
            canvas: canvas as unknown as Parameters<
                typeof createFabricPositionSink
            >[0],
            requestRenderAll: canvas.requestRenderAll,
        };
    };

    it("moves each canvas marcher and redraws", () => {
        const { canvas, canvasMarchers, requestRenderAll } = fakeCanvas([1, 2]);
        const sink = createFabricPositionSink(canvas);

        expect(sink.apply(computePositionFrame(500, timelines))).toBe(true);
        expect(canvasMarchers[0].setLiveCoordinates).toHaveBeenCalledWith({
            x: 50,
            y: 25,
        });
        expect(canvasMarchers[1].setLiveCoordinates).toHaveBeenCalledWith({
            x: 10,
            y: 15,
        });
        expect(requestRenderAll).toHaveBeenCalledTimes(1);
    });

    it("asks to stop when a canvas marcher has no position", () => {
        const { canvas, canvasMarchers, requestRenderAll } = fakeCanvas([
            1, 2, 3,
        ]);
        const sink = createFabricPositionSink(canvas);
        const debug = vi.spyOn(console, "debug").mockImplementation(() => {});

        // Marcher 1 has ended and marcher 3 has no timeline
        expect(sink.apply(computePositionFrame(1500, timelines))).toBe(false);
        expect(canvasMarchers[0].setLiveCoordinates).not.toHaveBeenCalled();
        expect(canvasMarchers[1].setLiveCoordinates).toHaveBeenCalled();
        expect(canvasMarchers[2].setLiveCoordinates).not.toHaveBeenCalled();
        expect(requestRenderAll).toHaveBeenCalledTimes(1);
        debug.mockRestore();
    });

    it("moves marchers but skips the redraw while the canvas is hidden", () => {
        const { canvas, canvasMarchers, requestRenderAll } = fakeCanvas([1]);
        let visible = false;
        const sink = createFabricPositionSink(canvas, () => visible);

        expect(sink.apply(computePositionFrame(500, timelines))).toBe(true);
        expect(canvasMarchers[0].setLiveCoordinates).toHaveBeenCalled();
        expect(requestRenderAll).not.toHaveBeenCalled();

        visible = true;
        sink.apply(computePositionFrame(600, timelines));
        expect(requestRenderAll).toHaveBeenCalledTimes(1);
    });
});
