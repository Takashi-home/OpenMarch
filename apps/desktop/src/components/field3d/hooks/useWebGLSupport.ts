import { useMemo } from "react";

/** True when the browser can create a WebGL context (WebGL 2 preferred). */
export function isWebGLAvailable(
    createCanvas: () => HTMLCanvasElement = () =>
        document.createElement("canvas"),
): boolean {
    try {
        const canvas = createCanvas();
        const context =
            canvas.getContext("webgl2") ?? canvas.getContext("webgl");
        if (!context) return false;
        context.getExtension("WEBGL_lose_context")?.loseContext();
        return true;
    } catch {
        return false;
    }
}

/** Checks WebGL support once per mounted component. */
export function useWebGLSupport(): boolean {
    return useMemo(() => isWebGLAvailable(), []);
}
