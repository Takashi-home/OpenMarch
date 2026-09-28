import * as z from "zod";
import { MIN_TEMPO_BPM } from "@/global/classes/Beat";

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
