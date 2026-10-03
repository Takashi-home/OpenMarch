import { useEffect, useState } from "react";
import { useThree } from "@react-three/fiber";
import { Button } from "@openmarch/ui";
import { VirtualRealityIcon } from "@phosphor-icons/react";
import { useTolgee } from "@tolgee/react";
import { OVERLAY_CONTROL_STYLE } from "../overlayStyle";
import { toast } from "sonner";
import type { CameraBridge } from "../camera/cameraBridge";
import type { CameraPose } from "../camera/defaultCamera";
import {
    isImmersiveVrSupported,
    vrViewerPlacement,
    yawQuaternion,
} from "./xrViewer";

/** Lets the button outside the canvas start a VR session inside it. */
export interface VrBridge {
    enter: ((pose: CameraPose) => Promise<void>) | null;
}

export function createVrBridge(): VrBridge {
    return { enter: null };
}

/**
 * Inside the canvas: starts an immersive VR session on request and places the
 * viewer where the current camera is, facing the same way. React Three Fiber
 * switches to the headset's frame loop while the session runs.
 */
export function VrSessionController({ bridge }: { bridge: VrBridge }) {
    const gl = useThree((state) => state.gl);

    useEffect(() => {
        bridge.enter = async (pose) => {
            const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
            if (!xr) throw new Error("WebXR is not available");
            const session = await xr.requestSession("immersive-vr", {
                optionalFeatures: ["local-floor"],
            });
            try {
                gl.xr.setReferenceSpaceType("local-floor");
                await gl.xr.setSession(session);
            } catch (error) {
                await session.end().catch(() => {});
                throw error;
            }
            const space = gl.xr.getReferenceSpace();
            if (!space) return;
            const placement = vrViewerPlacement(pose);
            // The offset space's origin, seen from the headset's space, is the
            // inverse of where the viewer stands in the scene
            const viewer = new XRRigidTransform(
                placement.position,
                yawQuaternion(placement.yaw),
            );
            gl.xr.setReferenceSpace(
                space.getOffsetReferenceSpace(viewer.inverse),
            );
        };
        return () => {
            bridge.enter = null;
        };
    }, [bridge, gl]);

    return null;
}

/** "View in VR" button, shown only when a VR headset can be used. */
export function VrButton({
    vrBridge,
    cameraBridge,
}: {
    vrBridge: VrBridge;
    cameraBridge: CameraBridge;
}) {
    const { t } = useTolgee();
    const [supported, setSupported] = useState(false);

    useEffect(() => {
        let cancelled = false;
        void isImmersiveVrSupported().then((result) => {
            if (!cancelled) setSupported(result);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    if (!supported) return null;

    const enter = () => {
        const pose = cameraBridge.current;
        if (!pose || !vrBridge.enter) return;
        vrBridge.enter(pose).catch((error: unknown) => {
            console.error("Could not start VR", error);
            toast.error(t("field3d.vr.failed"));
        });
    };

    return (
        <Button
            className="absolute right-8 bottom-8 z-10 shadow-md"
            style={OVERLAY_CONTROL_STYLE}
            variant="secondary"
            size="compact"
            onClick={enter}
            data-testid="enterVr"
        >
            <VirtualRealityIcon size={18} />
            {t("field3d.vr.enter")}
        </Button>
    );
}
