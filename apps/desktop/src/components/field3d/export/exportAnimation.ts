import type { FieldProperties } from "@openmarch/core";
import type Page from "@/global/classes/Page";
import { getCoordinatesAtTime, MarcherTimeline } from "@/utilities/Keyframes";
import {
    getPlaybackPageForTimeMs,
    MarcherAppearancesByPageId,
} from "@/components/exporting/utils/exportAppearances";
import { fieldToWorld } from "../coords/fieldToWorld";
import { createHeadingTracker, MarcherPose } from "../playback/livePlayback";
import {
    buildMarcherInstances,
    MarcherInstancesByShape,
} from "../scene/marcherInstances";
import type { CameraPose } from "../camera/defaultCamera";
import {
    FixedCameraPresetId,
    followBlend,
    followCameraPose,
    getCameraPresetPose,
    lerpCameraPose,
} from "../camera/cameraPresets";

/** Camera for a 3D video: a fixed preset, or following one marcher. */
export type Export3DCamera =
    | { kind: "preset"; preset: FixedCameraPresetId }
    | { kind: "follow"; marcherId: number };

export interface Export3DFrame {
    /** Shape, color and visibility of every shown marcher, from the active page */
    instancesByShape: MarcherInstancesByShape;
    /** Where each marcher stands and faces at this time */
    poses: ReadonlyMap<number, MarcherPose>;
    camera: CameraPose;
}

/**
 * Steps a 3D video through time. Each call to `frameAt` must advance time by
 * the frame interval; the same inputs always produce the same frames, so the
 * export is deterministic.
 */
// eslint-disable-next-line max-lines-per-function
export function createExportAnimation({
    fieldProperties,
    sortedPages,
    marcherIds,
    marcherTimelines,
    marcherAppearancesByPageId,
    camera,
}: {
    fieldProperties: FieldProperties;
    sortedPages: Page[];
    marcherIds: number[];
    marcherTimelines: ReadonlyMap<number, MarcherTimeline>;
    marcherAppearancesByPageId?: MarcherAppearancesByPageId;
    camera: Export3DCamera;
}) {
    const headings = createHeadingTracker();
    const poses = new Map<number, MarcherPose>();
    const instancesByPageId = new Map<number, MarcherInstancesByShape>();
    // Positions come from the timelines; the page only decides the appearance
    const placeholderPages = Object.fromEntries(
        marcherIds.map((id) => [id, { x: 0, y: 0, rotation_degrees: 0 }]),
    );
    const fixedCamera =
        camera.kind === "preset"
            ? getCameraPresetPose(camera.preset, fieldProperties)
            : null;
    let followPose: CameraPose | null = null;

    const instancesForPage = (page: Page) => {
        let instances = instancesByPageId.get(page.id);
        if (!instances) {
            instances = buildMarcherInstances({
                marcherIds,
                marcherPages: placeholderPages,
                appearancesByMarcherId:
                    marcherAppearancesByPageId?.get(page.id) ?? {},
                fieldProperties,
            });
            instancesByPageId.set(page.id, instances);
        }
        return instances;
    };

    return {
        frameAt(timeMilliseconds: number, deltaSeconds: number): Export3DFrame {
            for (const marcherId of marcherIds) {
                const timeline = marcherTimelines.get(marcherId);
                const coords = timeline
                    ? getCoordinatesAtTime(timeMilliseconds, timeline)
                    : null;
                // Past the end of a timeline, the marcher stays where it was
                if (!coords) continue;
                const world = fieldToWorld(coords, fieldProperties);
                const yaw = headings.update(
                    marcherId,
                    world.x,
                    world.z,
                    0,
                    deltaSeconds,
                );
                poses.set(marcherId, { x: world.x, z: world.z, yaw });
            }

            const page = getPlaybackPageForTimeMs(
                sortedPages,
                timeMilliseconds,
            );
            return {
                instancesByShape: instancesForPage(page),
                poses,
                camera: fixedCamera ?? nextFollowPose(deltaSeconds),
            };
        },
    };

    function nextFollowPose(deltaSeconds: number): CameraPose {
        const marcherId = camera.kind === "follow" ? camera.marcherId : -1;
        const marcher = poses.get(marcherId);
        if (!marcher)
            return (
                followPose ?? getCameraPresetPose("press-box", fieldProperties)
            );
        const desired = followCameraPose(marcher);
        // Same catch-up as the on-screen follow camera
        followPose = followPose
            ? lerpCameraPose(followPose, desired, followBlend(deltaSeconds))
            : desired;
        return followPose;
    }
}
