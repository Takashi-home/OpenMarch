import type OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import type { PositionSink } from "./PlaybackClock";

/**
 * Draws playback frames on the 2D fabric canvas.
 *
 * Asks playback to stop when a marcher on the canvas has no position, which
 * happens at the end of the show or when its timeline is missing.
 *
 * @param shouldRender - Returns false while the canvas is hidden (e.g. in 3D
 * view mode). Marchers still move so the canvas is current when shown again,
 * but the redraw is skipped.
 */
export function createFabricPositionSink(
    canvas: Pick<OpenMarchCanvas, "getCanvasMarchers" | "requestRenderAll">,
    shouldRender: () => boolean = () => true,
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

            if (shouldRender()) canvas.requestRenderAll();
            return shouldContinue;
        },
    };
}
