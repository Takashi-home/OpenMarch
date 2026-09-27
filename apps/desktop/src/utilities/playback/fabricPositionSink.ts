import type OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import type { PositionSink } from "./PlaybackClock";

/**
 * Draws playback frames on the 2D fabric canvas.
 *
 * Asks playback to stop when a marcher on the canvas has no position, which
 * happens at the end of the show or when its timeline is missing.
 */
export function createFabricPositionSink(
    canvas: Pick<OpenMarchCanvas, "getCanvasMarchers" | "requestRenderAll">,
): PositionSink {
    return {
        apply(frame) {
            let shouldContinue = true;

            for (const canvasMarcher of canvas.getCanvasMarchers()) {
                const coords = frame.positions.get(canvasMarcher.marcherObj.id);
                if (coords) {
                    canvasMarcher.setLiveCoordinates(coords);
                } else {
                    console.debug(
                        `Marcher ${canvasMarcher.marcherObj.id} has no position at time ${frame.timeMilliseconds}`,
                    );
                    shouldContinue = false;
                }
            }

            canvas.requestRenderAll();
            return shouldContinue;
        },
    };
}
