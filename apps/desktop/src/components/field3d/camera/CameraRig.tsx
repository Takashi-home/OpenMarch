import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { PerspectiveCamera, Vector3 } from "three";
import type { FieldProperties } from "@openmarch/core";
import type { CameraPresetId } from "@/stores/UiSettingsStore";
import type { MarcherPose } from "../playback/livePlayback";
import type { CameraPose } from "./defaultCamera";
import {
    CAMERA_TRANSITION_SECONDS,
    followCameraPose,
    getCameraPresetPose,
    interpolateCameraPose,
    isFixedCameraPreset,
} from "./cameraPresets";

/** The parts of drei's OrbitControls (`makeDefault`) the rig uses. */
interface OrbitControlsLike {
    target: Vector3;
    update(): void;
    addEventListener(type: "start", listener: () => void): void;
    removeEventListener(type: "start", listener: () => void): void;
}

/** How quickly the follow camera catches up with its marcher (1/seconds). */
const FOLLOW_STIFFNESS = 6;

function readPose(camera: PerspectiveCamera, target: Vector3): CameraPose {
    return {
        position: [camera.position.x, camera.position.y, camera.position.z],
        target: [target.x, target.y, target.z],
        fov: camera.fov,
    };
}

function applyPose(
    camera: PerspectiveCamera,
    controls: OrbitControlsLike,
    pose: CameraPose,
) {
    camera.position.set(...pose.position);
    controls.target.set(...pose.target);
    if (camera.fov !== pose.fov) {
        camera.fov = pose.fov;
        camera.updateProjectionMatrix();
    }
    controls.update();
}

/**
 * Moves the camera to the chosen preset (with a short glide), follows a
 * marcher in "follow" mode, and reports when the user takes over with the
 * mouse so the preset can switch to "free".
 */
export default function CameraRig({
    preset,
    fieldProperties,
    followMarcherId,
    displayedPoses,
    onUserControl,
}: {
    preset: CameraPresetId;
    fieldProperties: Pick<
        FieldProperties,
        "centerFrontPoint" | "width" | "height"
    >;
    /** Marcher to follow in "follow" mode */
    followMarcherId: number | null;
    displayedPoses: ReadonlyMap<number, MarcherPose>;
    onUserControl: () => void;
}) {
    const camera = useThree((state) => state.camera) as PerspectiveCamera;
    const controls = useThree(
        (state) => state.controls,
    ) as unknown as OrbitControlsLike | null;
    const invalidate = useThree((state) => state.invalidate);
    const transitionRef = useRef<{
        from: CameraPose;
        to: CameraPose;
        elapsedSeconds: number;
    } | null>(null);
    const hasAppliedRef = useRef(false);

    // Glide to a fixed preset whenever it (or the field) changes
    useEffect(() => {
        if (!controls || !isFixedCameraPreset(preset)) return;
        const to = getCameraPresetPose(preset, fieldProperties);
        if (!hasAppliedRef.current) {
            // First placement: no glide from the default camera
            hasAppliedRef.current = true;
            applyPose(camera, controls, to);
        } else {
            transitionRef.current = {
                from: readPose(camera, controls.target),
                to,
                elapsedSeconds: 0,
            };
        }
        invalidate();
    }, [preset, fieldProperties, camera, controls, invalidate]);

    // Mouse or trackpad input hands the camera to the user
    useEffect(() => {
        if (!controls) return;
        const handleStart = () => {
            transitionRef.current = null;
            onUserControl();
        };
        controls.addEventListener("start", handleStart);
        return () => controls.removeEventListener("start", handleStart);
    }, [controls, onUserControl]);

    useFrame((_, deltaSeconds) => {
        if (!controls) return;

        const transition = transitionRef.current;
        if (transition) {
            transition.elapsedSeconds += deltaSeconds;
            const progress =
                transition.elapsedSeconds / CAMERA_TRANSITION_SECONDS;
            applyPose(
                camera,
                controls,
                interpolateCameraPose(transition.from, transition.to, progress),
            );
            if (progress >= 1) transitionRef.current = null;
            else invalidate();
            return;
        }

        if (preset === "follow" && followMarcherId != null) {
            const marcher = displayedPoses.get(followMarcherId);
            if (!marcher) return;
            const desired = followCameraPose(marcher, camera.fov);
            // Ease toward the marcher so the camera does not jerk
            const blend = 1 - Math.exp(-FOLLOW_STIFFNESS * deltaSeconds);
            const current = readPose(camera, controls.target);
            applyPose(
                camera,
                controls,
                interpolateLinear(current, desired, blend),
            );
            const [x, y, z] = desired.position;
            const remaining = Math.hypot(
                camera.position.x - x,
                camera.position.y - y,
                camera.position.z - z,
            );
            if (remaining > 0.01) invalidate();
        }
    });

    return null;
}

function interpolateLinear(
    from: CameraPose,
    to: CameraPose,
    t: number,
): CameraPose {
    const mix = (a: readonly number[], b: readonly number[]) =>
        [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t) as [
            number,
            number,
            number,
        ];
    return {
        position: mix(from.position, to.position),
        target: mix(from.target, to.target),
        fov: from.fov + (to.fov - from.fov) * t,
    };
}
