import type {
    OverlayOptions,
    OverlayPlacement,
    OverlayState,
} from "./videoOverlay";
import type { VideoTheme } from "./videoTheme";
import {
    createVideoRenderContext,
    CreateVideoRenderContextArgs,
    DEFAULT_FIELD_FRAMING,
    FieldFraming,
    renderVideoFrame,
} from "./videoFrameRenderer";

/**
 * Draws video frames onto a canvas that the encoder reads. The 2D (fabric)
 * and 3D (three.js) views each provide one, so encoding, audio and file
 * writing in `exportVideo` stay shared.
 */
export interface FrameRenderer {
    /** The canvas the encoder captures after each `render` call */
    readonly canvas: HTMLCanvasElement;
    /**
     * Draws the frame at `timeSeconds`, including the info overlay (when
     * given) and branding. Frames are rendered in order, one frame interval
     * apart.
     */
    render(timeSeconds: number, overlayState?: OverlayState): void;
    dispose(): void;
}

/** Settings shared by every renderer. */
export interface FrameRendererCommonArgs {
    width: number;
    height: number;
    fps: number;
    durationSeconds: number;
    videoTheme: VideoTheme;
    overlayOptions?: OverlayOptions;
    overlayPlacement?: OverlayPlacement;
    brandingLogo: HTMLImageElement | null;
}

/** The original top-down 2D renderer, drawing the fabric canvas each frame. */
export async function createFabric2DFrameRenderer(
    args: FrameRendererCommonArgs &
        CreateVideoRenderContextArgs & { fieldFraming?: FieldFraming },
): Promise<FrameRenderer> {
    const renderContext = await createVideoRenderContext(args);

    const canvas = document.createElement("canvas");
    canvas.width = args.width;
    canvas.height = args.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        renderContext.dispose();
        throw new Error("Could not create export canvas");
    }

    return {
        canvas,
        render(timeSeconds, overlayState) {
            renderVideoFrame({
                ctx,
                context: renderContext,
                timeSeconds,
                durationSeconds: args.durationSeconds,
                width: args.width,
                height: args.height,
                videoTheme: args.videoTheme,
                fieldFraming: args.fieldFraming ?? DEFAULT_FIELD_FRAMING,
                overlayState,
                overlayOptions: args.overlayOptions,
                overlayPlacement: args.overlayPlacement,
                brandingLogo: args.brandingLogo,
            });
        },
        dispose: () => renderContext.dispose(),
    };
}
