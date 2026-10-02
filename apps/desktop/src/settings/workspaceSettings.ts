import * as z from "zod";
import { MIN_TEMPO_BPM } from "@/global/classes/Beat";
import {
    EQUIPMENT_MOVE_KINDS,
    MAX_MOVE_COUNTS,
    MAX_MOVE_TURNS,
} from "@/components/field3d/scene/equipmentMoves";
import {
    MAX_CLIP_FRAMES,
    MAX_CLIPS,
} from "@/components/field3d/motion/motionClip";
import { MAX_CUE_COUNTS } from "@/components/field3d/motion/motionCues";

const vector3Schema = z.tuple([z.number(), z.number(), z.number()]);

/** A 3D view camera pose to pass through at a show time (milliseconds). */
export const cameraKeyframeSchema = z.object({
    id: z.string(),
    timeMs: z.number().min(0),
    pose: z.object({
        position: vector3Schema,
        target: vector3Schema,
        fov: z.number().positive(),
    }),
});

/**
 * Camera keyframes for the 3D view. Broken entries are dropped one by one so a
 * bad keyframe never discards the rest of the workspace settings.
 */
const cameraKeyframesSchema = z.preprocess(
    (value) =>
        Array.isArray(value)
            ? value.filter(
                  (item) => cameraKeyframeSchema.safeParse(item).success,
              )
            : undefined,
    z.array(cameraKeyframeSchema).optional(),
);

/** A toss, spin or sweep for flags and rifles in the 3D view. */
export const equipmentMoveSchema = z.object({
    id: z.string(),
    target: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("section"), section: z.string().min(1) }),
        z.object({ kind: z.literal("marcher"), marcherId: z.int() }),
    ]),
    pageId: z.int(),
    startCount: z.number().min(0),
    lengthCounts: z.number().positive().max(MAX_MOVE_COUNTS),
    move: z.enum(EQUIPMENT_MOVE_KINDS),
    turns: z.number().positive().max(MAX_MOVE_TURNS),
    direction: z.enum(["cw", "ccw"]),
});

/**
 * Equipment moves for the 3D view. Broken entries are dropped one by one so a
 * bad move never discards the rest of the workspace settings.
 */
const equipmentMovesSchema = z.preprocess(
    (value) =>
        Array.isArray(value)
            ? value.filter(
                  (item) => equipmentMoveSchema.safeParse(item).success,
              )
            : undefined,
    z.array(equipmentMoveSchema).optional(),
);

/** A performer's motion imported from a motion capture or animation file. */
export const motionClipSchema = z.object({
    id: z.string(),
    name: z.string(),
    fps: z.number().positive(),
    frameCount: z.int().min(1).max(MAX_CLIP_FRAMES),
    // Base64 of 16-bit joint positions; see `encodeMotionFrames`
    data: z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/),
});

/** When a marcher (or section) performs a motion clip. */
export const motionCueSchema = z.object({
    id: z.string(),
    clipId: z.string(),
    target: equipmentMoveSchema.shape.target,
    pageId: z.int(),
    startCount: z.number().min(0),
    lengthCounts: z.number().positive().max(MAX_CUE_COUNTS),
    mirror: z.boolean(),
    propHand: z.enum(["left", "right"]),
});

/**
 * A list kept in the workspace settings whose broken entries are dropped one
 * by one, so a bad entry never discards the rest of the workspace settings.
 */
function tolerantList<T extends z.ZodType>(item: T, max?: number) {
    return z.preprocess(
        (value) =>
            Array.isArray(value)
                ? value
                      .filter((entry) => item.safeParse(entry).success)
                      .slice(0, max)
                : undefined,
        z.array(item).optional(),
    );
}

export const workspaceSettingsSchema = z.object({
    defaultBeatsPerMeasure: z.int().positive().default(4),
    defaultTempo: z.float64().min(MIN_TEMPO_BPM).default(120),
    defaultNewPageCounts: z.int().positive().default(16),
    audioOffsetSeconds: z.float64().default(0),
    pageNumberOffset: z.int().default(0),
    measurementOffset: z.int().default(1),
    projectName: z.string().optional(),
    designer: z.string().optional(),
    client: z.string().optional(),
    activity: z.string().optional(),

    // Mobile export settings
    otmProductionId: z.preprocess(
        (v) => (v === "" || v === undefined ? undefined : v),
        z.optional(z.coerce.number().int().positive()),
    ),

    /**
     * 3D view camera keyframes. Only `updateWorkspaceCameraKeyframes` changes
     * them; other settings updates keep the stored value.
     */
    cameraKeyframes: cameraKeyframesSchema,

    /**
     * Tosses, spins and sweeps for flags and rifles in the 3D view. Only
     * `updateWorkspaceEquipmentMoves` changes them; other settings updates keep
     * the stored value.
     */
    equipmentMoves: equipmentMovesSchema,

    /**
     * Performer motions (from motion capture files) and when marchers perform
     * them in the 3D view. Only `updateWorkspaceMotion` changes them; other
     * settings updates keep the stored values.
     */
    motionClips: tolerantList(motionClipSchema, MAX_CLIPS),
    motionCues: tolerantList(motionCueSchema),
});

export type WorkspaceSettings = z.infer<typeof workspaceSettingsSchema>;

/**
 * Default workspace settings
 */
export const defaultWorkspaceSettings: WorkspaceSettings = {
    defaultBeatsPerMeasure: 4,
    defaultTempo: 120,
    defaultNewPageCounts: 16,
    audioOffsetSeconds: 0,
    pageNumberOffset: 0,
    measurementOffset: 0,
    projectName: undefined,
    designer: undefined,
    client: undefined,
    activity: undefined,
    otmProductionId: undefined,
};

/**
 * Parses workspace settings from JSON string
 */
export function parseWorkspaceSettings(jsonData: string): WorkspaceSettings {
    try {
        const parsed = JSON.parse(jsonData);
        return workspaceSettingsSchema.parse(parsed);
    } catch (error) {
        console.warn(
            "Failed to parse workspace settings, using defaults:",
            error,
        );
        return defaultWorkspaceSettings;
    }
}

/**
 * Serializes workspace settings to JSON string
 */
export function serializeWorkspaceSettings(
    settings: WorkspaceSettings,
): string {
    return JSON.stringify(settings);
}
