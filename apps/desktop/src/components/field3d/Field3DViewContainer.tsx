import { lazy, Suspense } from "react";
import { CircleNotchIcon, CubeIcon } from "@phosphor-icons/react";
import { T } from "@tolgee/react";
import { useWebGLSupport } from "./hooks/useWebGLSupport";
import CameraPresetMenu from "./camera/CameraPresetMenu";

// three.js is only loaded once the 3D view is shown
const Field3DView = lazy(() => import("./Field3DView"));

/** The 3D view pane, with a message when WebGL is unavailable. */
export default function Field3DViewContainer() {
    const webGLSupported = useWebGLSupport();

    return (
        <div
            className="rounded-6 bg-bg-1 relative h-full w-full overflow-hidden"
            data-testid="field3dContainer"
        >
            {webGLSupported ? (
                <Suspense
                    fallback={
                        <div className="flex h-full w-full items-center justify-center">
                            <CircleNotchIcon
                                size={32}
                                className="text-text animate-spin"
                            />
                        </div>
                    }
                >
                    <Field3DView />
                    <CameraPresetMenu />
                </Suspense>
            ) : (
                <div className="text-text-subtitle flex h-full w-full flex-col items-center justify-center gap-8 p-16 text-center">
                    <CubeIcon size={32} />
                    <p className="text-body">
                        <T keyName="field3d.webglUnavailable" />
                    </p>
                </div>
            )}
        </div>
    );
}
