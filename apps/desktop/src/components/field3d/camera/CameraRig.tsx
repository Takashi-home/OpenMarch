import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { PerspectiveCamera, Vector3 } from "three";
import type { FieldProperties } from "@openmarch/core";
import type { CameraPresetId } from "@/stores/UiSettingsStore";
import type { MarcherPose } from "../playback/livePlayback";
import type { CameraPose } from "./defaultCamera";
import type { CameraBridge } from "./cameraBridge";
import { CameraKeyframe, cameraPoseAtTime } from "./cameraKeyframes";
import {
    CAMERA_TRANSITION_SECONDS,
    followBlend,
    followCameraPose,
    getCameraPresetPose,
    interpolateCameraPose,
    isFixedCameraPreset,
    lerpCameraPose,
} from "./cameraPresets";

/** The parts of drei's OrbitControls (`makeDefault`) the rig uses. */
interface OrbitControlsLike {
    target: Vector3;
    update(): void;
    addEventListener(type: "start", listener: () => void): void;
    removeEventListener(type: "start", listener: () => void): void;
}

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

const posesEqual = (a: CameraPose, b: CameraPose) =>
    a.fov === b.fov &&
    a.position.every((value, i) => value === b.position[i]) &&
    a.target.every((value, i) => value === b.target[i]);

/**
 * Moves the camera to the chosen preset (with a short glide), follows a
 * marcher in "follow" mode or the camera keyframes in "keyframes" mode, and
 * reports when the user takes over with the mouse so the preset can switch to
 * "free".
 */
// eslint-disable-next-line max-lines-per-function
export default function CameraRig({
    preset,
    fieldProperties,
    followMarcherId,
    displayedPoses,
    onUserControl,
    keyframes = [],
    showTimeMs = () => 0,
    bridge,
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
    /** Camera path for "keyframes" mode */
    keyframes?: readonly CameraKeyframe[];
    /** Current show time in milliseconds, for "keyframes" mode */
    showTimeMs?: () => number;
    /** Shares the view with UI outside the canvas */
    bridge?: CameraBridge;
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

    useEffect(() => {
        if (!bridge) return;
        bridge.invalidate = invalidate;
        return () => {
            bridge.invalidate = () => {};
        };
    }, [bridge, invalidate]);

    // Glide to a fixed preset (or onto the keyframe path) when it changes
    useEffect(() => {
        if (!controls) return;
        const to = isFixedCameraPreset(preset)
            ? getCameraPresetPose(preset, fieldProperties)
            : preset === "keyframes"
              ? cameraPoseAtTime(keyframes, showTimeMs())
              : null;
        if (!to) return;
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
        // Keyframe edits and page changes are picked up per frame, not here
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [preset, fieldProperties, camera, controls, invalidate]);

    // Redraw when the keyframe path or the paused time changes
    useEffect(() => {
        if (preset === "keyframes") invalidate();
    }, [preset, keyframes, showTimeMs, invalidate]);

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

        const requested = bridge?.takeRequest();
        if (requested) {
            transitionRef.current = null;
            applyPose(camera, controls, requested);
        }

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

        if (preset === "keyframes") {
            const pose = cameraPoseAtTime(keyframes, showTimeMs());
            if (pose && !posesEqual(pose, readPose(camera, controls.target)))
                applyPose(camera, controls, pose);
            return;
        }

        if (preset === "follow" && followMarcherId != null) {
            const marcher = displayedPoses.get(followMarcherId);
            if (!marcher) return;
            const desired = followCameraPose(marcher, camera.fov);
            // Ease toward the marcher so the camera does not jerk
            const current = readPose(camera, controls.target);
            applyPose(
                camera,
                controls,
                lerpCameraPose(current, desired, followBlend(deltaSeconds)),
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

    // Report the final pose of each frame to UI outside the canvas
    useFrame(() => {
        if (bridge && controls)
            bridge.current = readPose(camera, controls.target);
    });

    return null;
}
