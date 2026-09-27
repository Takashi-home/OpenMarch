import { useEffect, useState } from "react";
import { CircleNotchIcon } from "@phosphor-icons/react";
import type { OverlayState } from "@/components/exporting/video/videoOverlay";
import type { Three3DFrameRendererArgs } from "./Three3DFrameRenderer";

/** Preview size; small keeps it quick while matching the 16:9 export frame. */
const PREVIEW_WIDTH = 640;
const PREVIEW_HEIGHT = 360;
/** Wait for option changes to settle before re-rendering. */
const PREVIEW_DELAY_MS = 250;

export type Video3DPreviewArgs = Omit<
    Three3DFrameRendererArgs,
    "width" | "height" | "fps" | "brandingLogo"
> & {
    brandingLogo?: HTMLImageElement | null;
    overlayState?: OverlayState;
};

/**
 * First frame of the 3D video, rendered with the export renderer itself so
 * the preview matches the file exactly.
 */
export default function Video3DPreview({
    args,
    loadingLabel,
}: {
    args: Video3DPreviewArgs | null;
    loadingLabel: string;
}) {
    const [image, setImage] = useState<string | null>(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!args) return;
        let cancelled = false;
        const timer = setTimeout(() => {
            void (async () => {
                try {
                    const { createThree3DFrameRenderer } =
                        await import("./Three3DFrameRenderer");
                    const renderer = await createThree3DFrameRenderer({
                        ...args,
                        brandingLogo: args.brandingLogo ?? null,
                        width: PREVIEW_WIDTH,
                        height: PREVIEW_HEIGHT,
                        fps: 30,
                    });
                    try {
                        renderer.render(0, args.overlayState);
                        if (!cancelled) {
                            setImage(renderer.canvas.toDataURL("image/png"));
                            setError(false);
                        }
                    } finally {
                        renderer.dispose();
                    }
                } catch (renderError) {
                    console.error("Failed to render 3D preview", renderError);
                    if (!cancelled) setError(true);
                }
            })();
        }, PREVIEW_DELAY_MS);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [args]);

    return (
        <div
            className="rounded-6 border-stroke bg-fg-2 relative flex aspect-video w-full items-center justify-center overflow-hidden border"
            data-testid="video3dPreview"
        >
            {image && !error ? (
                <img src={image} alt="" className="h-full w-full" />
            ) : (
                <div className="text-text-subtitle flex items-center gap-8">
                    {!error && (
                        <CircleNotchIcon size={20} className="animate-spin" />
                    )}
                    <span className="text-sub">{loadingLabel}</span>
                </div>
            )}
        </div>
    );
}
