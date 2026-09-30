import * as z from "zod";
import { MIN_TEMPO_BPM } from "@/global/classes/Beat";
import {
    EQUIPMENT_MOVE_KINDS,
    MAX_MOVE_COUNTS,
    MAX_MOVE_TURNS,
} from "@/components/field3d/scene/equipmentMoves";

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
