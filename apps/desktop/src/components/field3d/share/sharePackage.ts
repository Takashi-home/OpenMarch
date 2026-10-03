import type { FieldProperties } from "@openmarch/core";
import type Page from "@/global/classes/Page";
import type { MarcherTimeline } from "@/utilities/Keyframes";
import type { MarcherAppearancesByPageId } from "@/components/exporting/utils/exportAppearances";
import { getFieldWorldBounds } from "../camera/defaultCamera";
import { createExportAnimation } from "../export/exportAnimation";
import { equipmentForSection, EquipmentKind } from "../scene/equipment";
import {
    EquipmentMove,
    resolveEquipmentMoves,
    ResolvedEquipmentMove,
} from "../scene/equipmentMoves";
import {
    MARCHER_SHAPES_3D,
    MarcherInstancesByShape,
    MarcherShape3D,
} from "../scene/marcherInstances";
import type { MotionClip } from "../motion/motionClip";
import type { MotionCue, ResolvedMotionCue } from "../motion/motionCues";

/**
 * A show packed for the phone viewer (the "drill-viewer" web app): everything
 * it needs to play the show in 3D without OpenMarch. Positions are sampled
 * from the same animation as the 3D video export, so both move the same way.
 *
 * Bump `SHARE_FORMAT_VERSION` on any change the viewer must know about; the
 * viewer refuses versions it does not understand.
 */
export const SHARE_FORMAT = "openmarch-3d-share";
export const SHARE_FORMAT_VERSION = 1;
/** Position samples per second; the viewer interpolates between them */
export const SHARE_FPS = 10;
export const SHARE_FILE_EXTENSION = ".omview.json";

/** One marcher's look on a span of the show (null while hidden). */
export interface ShareAppearance {
    shape: MarcherShape3D;
    /** sRGB 0–255 */
    color: [number, number, number];
    label: boolean;
}

export interface SharePackage {
    format: typeof SHARE_FORMAT;
    version: typeof SHARE_FORMAT_VERSION;
    title: string;
    /** ISO 8601 */
    exportedAt: string;
    durationMs: number;
    fps: number;
    field: {
        /** The field drawn by OpenMarch, as a data URL */
        image: string;
        /** World meters; see `FieldWorldBounds` */
        bounds: {
            centerX: number;
            centerZ: number;
            width: number;
            depth: number;
        };
    };
    marchers: {
        id: number;
        drillNumber: string;
        section: string;
        equipment: EquipmentKind | null;
    }[];
    /**
     * Base64 of 16-bit little-endian integers, frame by frame, marcher by
     * marcher (in `marchers` order): x and z in centimeters from the field
     * center, then the yaw in ten-thousandths of a radian
     */
    frames: string;
    /** From `startMs` on, each marcher's look (in `marchers` order) */
    appearances: { startMs: number; marchers: (ShareAppearance | null)[] }[];
    /** For showing the set and count while playing */
    pages: { name: string; startMs: number; beatMs: number[] }[];
    equipmentMoves: ResolvedEquipmentMove[];
    motion: { clips: MotionClip[]; cues: ResolvedMotionCue[] };
    audio?: { mimeType: string; data: string; offsetSeconds: number };
}

export interface SharePackageInput {
    title: string;
    fieldProperties: FieldProperties;
    /** The field texture, e.g. from `renderFieldTextureCanvas` */
    fieldImage: string;
    sortedPages: Page[];
    marchers: { id: number; drill_number: string; section: string }[];
    marcherTimelines: ReadonlyMap<number, MarcherTimeline>;
    marcherAppearancesByPageId?: MarcherAppearancesByPageId;
    equipmentMoves: readonly EquipmentMove[];
    motionClips: readonly MotionClip[];
    motionCues: readonly MotionCue[];
    audio?: { mimeType: string; bytes: ArrayBuffer; offsetSeconds: number };
    /** For tests; the export time otherwise */
    now?: Date;
}

const CENTIMETERS = 100;
const YAW_SCALE = 10_000;
const INT16_LIMIT = 32767;

const toInt16 = (value: number) =>
    Math.min(Math.max(Math.round(value), -INT16_LIMIT), INT16_LIMIT);

export function bytesToBase64(bytes: Uint8Array): string {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk)
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    return btoa(binary);
}

/** Each marcher's look from a frame's instances, in `ids` order. */
function appearancesOf(
    instancesByShape: MarcherInstancesByShape,
    ids: readonly number[],
): (ShareAppearance | null)[] {
    const byId = new Map<number, ShareAppearance>();
    for (const shape of MARCHER_SHAPES_3D)
        for (const instance of instancesByShape[shape])
            byId.set(instance.marcherId, {
                shape,
                color: [
                    Math.round(instance.color.r * 255),
                    Math.round(instance.color.g * 255),
                    Math.round(instance.color.b * 255),
                ],
                label: instance.labelVisible,
            });
    return ids.map((id) => byId.get(id) ?? null);
}

/** The length of the show: to the end of the last page. */
export function showDurationMs(pages: readonly Page[]): number {
    const last = pages[pages.length - 1];
    return last ? (last.timestamp + last.duration) * 1000 : 0;
}

/** Packs the show for the phone viewer (see `SharePackage`). */
// eslint-disable-next-line max-lines-per-function
export function buildSharePackage(input: SharePackageInput): SharePackage {
    const { fieldProperties, sortedPages, marchers } = input;
    const ids = marchers.map((marcher) => marcher.id);
    const bounds = getFieldWorldBounds(fieldProperties);
    const durationMs = showDurationMs(sortedPages);
    const frameCount = Math.floor((durationMs / 1000) * SHARE_FPS) + 1;
    const frameSeconds = 1 / SHARE_FPS;

    const animation = createExportAnimation({
        fieldProperties,
        sortedPages,
        marcherIds: ids,
        marcherTimelines: input.marcherTimelines,
        marcherAppearancesByPageId: input.marcherAppearancesByPageId,
        camera: { kind: "preset", preset: "press-box" },
    });

    const view = new DataView(new ArrayBuffer(frameCount * ids.length * 6));
    const appearances: SharePackage["appearances"] = [];
    let lastInstances: MarcherInstancesByShape | null = null;
    const center = { x: bounds.centerX, z: bounds.centerZ, yaw: 0 };
    const lastPose = new Map<number, { x: number; z: number; yaw: number }>();

    for (let frame = 0; frame < frameCount; frame++) {
        const timeMs = Math.min(frame * 1000 * frameSeconds, durationMs);
        const { poses, instancesByShape } = animation.frameAt(
            timeMs,
            frameSeconds,
        );
        // A new page's look starts here
        if (instancesByShape !== lastInstances) {
            lastInstances = instancesByShape;
            appearances.push({
                startMs: timeMs,
                marchers: appearancesOf(instancesByShape, ids),
            });
        }
        ids.forEach((id, index) => {
            const pose = poses.get(id) ?? lastPose.get(id) ?? center;
            lastPose.set(id, pose);
            const offset = (frame * ids.length + index) * 6;
            view.setInt16(
                offset,
                toInt16((pose.x - bounds.centerX) * CENTIMETERS),
                true,
            );
            view.setInt16(
                offset + 2,
                toInt16((pose.z - bounds.centerZ) * CENTIMETERS),
                true,
            );
            view.setInt16(offset + 4, toInt16(pose.yaw * YAW_SCALE), true);
        });
    }

    return {
        format: SHARE_FORMAT,
        version: SHARE_FORMAT_VERSION,
        title: input.title,
        exportedAt: (input.now ?? new Date()).toISOString(),
        durationMs,
        fps: SHARE_FPS,
        field: {
            image: input.fieldImage,
            bounds: {
                centerX: bounds.centerX,
                centerZ: bounds.centerZ,
                width: bounds.width,
                depth: bounds.depth,
            },
        },
        marchers: marchers.map((marcher) => ({
            id: marcher.id,
            drillNumber: marcher.drill_number,
            section: marcher.section,
            equipment: equipmentForSection(marcher.section),
        })),
        frames: bytesToBase64(new Uint8Array(view.buffer)),
        appearances,
        pages: sortedPages.map((page) => ({
            name: page.name,
            startMs: page.timestamp * 1000,
            beatMs: page.beats.map((beat) => beat.duration * 1000),
        })),
        equipmentMoves: resolveEquipmentMoves(
            input.equipmentMoves,
            sortedPages,
        ),
        motion: {
            // Only the clips some cue plays
            clips: input.motionClips.filter((clip) =>
                input.motionCues.some((cue) => cue.clipId === clip.id),
            ),
            cues: resolveEquipmentMoves(input.motionCues, sortedPages),
        },
        ...(input.audio
            ? {
                  audio: {
                      mimeType: input.audio.mimeType,
                      data: bytesToBase64(new Uint8Array(input.audio.bytes)),
                      offsetSeconds: input.audio.offsetSeconds,
                  },
              }
            : {}),
    };
}

/** The audio type for a file name; MP3 when it cannot be told. */
export function audioMimeType(fileName: string): string {
    const extension = fileName.slice(fileName.lastIndexOf(".") + 1);
    const types: Record<string, string> = {
        mp3: "audio/mpeg",
        m4a: "audio/mp4",
        aac: "audio/aac",
        wav: "audio/wav",
        ogg: "audio/ogg",
        flac: "audio/flac",
    };
    return types[extension.toLowerCase()] ?? "audio/mpeg";
}
