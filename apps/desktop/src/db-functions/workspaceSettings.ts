import { eq } from "drizzle-orm";
import * as z from "zod";
import { DbConnection, DbTransaction } from "./types";
import { schema } from "@/global/database/db";
import {
    cameraKeyframeSchema,
    equipmentMoveSchema,
    motionClipSchema,
    motionCueSchema,
    workspaceSettingsSchema,
} from "@/settings/workspaceSettings";

export type WorkspaceCameraKeyframe = z.infer<typeof cameraKeyframeSchema>;
export type WorkspaceEquipmentMove = z.infer<typeof equipmentMoveSchema>;
export type WorkspaceMotionClip = z.infer<typeof motionClipSchema>;
export type WorkspaceMotionCue = z.infer<typeof motionCueSchema>;

/**
 * Lists of show data kept in the workspace settings that only their own
 * update functions change. Other settings saves carry the stored lists over.
 */
interface ShowData {
    cameraKeyframes?: WorkspaceCameraKeyframe[];
    equipmentMoves?: WorkspaceEquipmentMove[];
    motionClips?: WorkspaceMotionClip[];
    motionCues?: WorkspaceMotionCue[];
}
const SHOW_DATA_KEYS = [
    "cameraKeyframes",
    "equipmentMoves",
    "motionClips",
    "motionCues",
] as const;

/** The show data stored in a workspace settings JSON string. */
function storedShowData(jsonData: string | undefined): ShowData {
    if (!jsonData) return {};
    try {
        // Each list is checked on its own, so an unrelated bad setting cannot lose them
        const stored = JSON.parse(jsonData) as Record<string, unknown>;
        const { shape } = workspaceSettingsSchema;
        return {
            cameraKeyframes: shape.cameraKeyframes.parse(
                stored?.cameraKeyframes,
            ),
            equipmentMoves: shape.equipmentMoves.parse(stored?.equipmentMoves),
            motionClips: shape.motionClips.parse(stored?.motionClips),
            motionCues: shape.motionCues.parse(stored?.motionCues),
        };
    } catch {
        return {};
    }
}

/**
 * Sets the show data in a workspace settings JSON string, removing each key
 * when its list is empty.
 */
function withShowData(jsonData: string, data: ShowData): string {
    const settings = JSON.parse(jsonData) as Record<string, unknown>;
    for (const key of SHOW_DATA_KEYS) {
        const list = data[key];
        if (list && list.length > 0) settings[key] = list;
        else delete settings[key];
    }
    return JSON.stringify(settings);
}

export type DatabaseWorkspaceSettings =
    typeof schema.workspace_settings.$inferSelect;

/**
 * Defines the editable fields of the workspace settings record.
 */
export interface ModifiedWorkspaceSettingsArgs {
    json_data?: string;
}

/**
 * Gets the workspace settings record from the database.
 * Since there's only ever one workspace settings record, this returns the single record or undefined.
 */
export async function getWorkspaceSettings({
    db,
}: {
    db: DbConnection;
}): Promise<DatabaseWorkspaceSettings | undefined> {
    // Initialize the workspace settings record if it doesn't exist
    await initializeWorkspaceSettings({ db });

    return await db.query.workspace_settings.findFirst();
}

/**
 * Updates the workspace settings record in the database.
 * Since there's only ever one workspace settings record, this updates the record with id = 1.
 * Note: This does NOT use history tracking (no undo/redo).
 *
 * Camera keyframes, equipment moves and motions are kept as stored unless
 * new ones are given, so settings forms that do not know about them (or hold
 * an older copy) never drop or roll them back.
 */
export async function updateWorkspaceSettings({
    db,
    args,
    cameraKeyframes,
    equipmentMoves,
    motionClips,
    motionCues,
}: {
    db: DbConnection;
    args: ModifiedWorkspaceSettingsArgs;
    /** New camera keyframes; leave out to keep the stored ones */
    cameraKeyframes?: WorkspaceCameraKeyframe[];
    /** New equipment moves; leave out to keep the stored ones */
    equipmentMoves?: WorkspaceEquipmentMove[];
    /** New motion clips; leave out to keep the stored ones */
    motionClips?: WorkspaceMotionClip[];
    /** New motion cues; leave out to keep the stored ones */
    motionCues?: WorkspaceMotionCue[];
}): Promise<DatabaseWorkspaceSettings> {
    // Initialize the workspace settings record if it doesn't exist
    await initializeWorkspaceSettings({ db });

    return await db.transaction(async (tx: DbTransaction) => {
        const current = await tx.query.workspace_settings.findFirst();
        const jsonData = args.json_data ?? current?.json_data;
        const stored = storedShowData(current?.json_data);
        const showData: ShowData = {
            cameraKeyframes: cameraKeyframes ?? stored.cameraKeyframes,
            equipmentMoves: equipmentMoves ?? stored.equipmentMoves,
            motionClips: motionClips ?? stored.motionClips,
            motionCues: motionCues ?? stored.motionCues,
        };
        await tx
            .update(schema.workspace_settings)
            .set({
                ...args,
                ...(jsonData !== undefined
                    ? { json_data: withShowData(jsonData, showData) }
                    : {}),
                updated_at: new Date().toISOString(),
            })
            .where(eq(schema.workspace_settings.id, 1));

        const updatedSettings = await tx.query.workspace_settings.findFirst();
        if (!updatedSettings) {
            throw new Error("Workspace settings record not found after update");
        }
        return updatedSettings;
    });
}

/**
 * Initializes the workspace settings record if it doesn't exist.
 * This should be called during database setup/migration.
 */
export async function initializeWorkspaceSettings({
    db,
}: {
    db: DbConnection;
}): Promise<DatabaseWorkspaceSettings> {
    // Check if workspace settings record already exists
    const existingSettings = await db
        .select()
        .from(schema.workspace_settings)
        .get();
    if (existingSettings) {
        return existingSettings;
    }

    // Create the workspace settings record with default values
    const defaultSettings = workspaceSettingsSchema.parse({});
    const [newSettings] = await db
        .insert(schema.workspace_settings)
        .values({
            id: 1,
            json_data: JSON.stringify(defaultSettings),
        })
        .returning();

    return newSettings;
}

/**
 * Gets the workspace settings as parsed JSON data.
 */
export async function getWorkspaceSettingsJSON({
    db,
}: {
    db: DbConnection;
}): Promise<string> {
    const settings = await getWorkspaceSettings({ db });
    if (!settings) {
        throw new Error("Workspace settings not found");
    }
    return settings.json_data;
}

/**
 * Gets the workspace settings as parsed object.
 */
export async function getWorkspaceSettingsParsed({
    db,
}: {
    db: DbConnection;
}): Promise<z.infer<typeof workspaceSettingsSchema>> {
    const jsonData = await getWorkspaceSettingsJSON({ db });
    return workspaceSettingsSchema.parse(JSON.parse(jsonData));
}

/**
 * Updates the workspace settings JSON data.
 */
export async function updateWorkspaceSettingsJSON({
    db,
    jsonData,
}: {
    db: DbConnection;
    jsonData: string;
}): Promise<string> {
    // Validate the JSON data before storing
    try {
        const parsed = JSON.parse(jsonData);
        workspaceSettingsSchema.parse(parsed);
    } catch (error) {
        throw new Error(`Invalid workspace settings JSON: ${error}`);
    }

    await updateWorkspaceSettings({
        db,
        args: { json_data: jsonData },
    });

    return jsonData;
}

/**
 * Updates the workspace settings with a parsed object.
 */
export async function updateWorkspaceSettingsParsed({
    db,
    settings,
}: {
    db: DbConnection;
    settings: z.infer<typeof workspaceSettingsSchema>;
}): Promise<z.infer<typeof workspaceSettingsSchema>> {
    // Validate the settings object
    const validatedSettings = workspaceSettingsSchema.parse(settings);

    await updateWorkspaceSettings({
        db,
        args: { json_data: JSON.stringify(validatedSettings) },
    });

    return validatedSettings;
}

/**
 * Replaces the 3D view camera keyframes stored in the show file, leaving the
 * other workspace settings as they are.
 */
export async function updateWorkspaceCameraKeyframes({
    db,
    keyframes,
}: {
    db: DbConnection;
    keyframes: WorkspaceCameraKeyframe[];
}): Promise<WorkspaceCameraKeyframe[]> {
    const validated = z.array(cameraKeyframeSchema).parse(keyframes);
    await updateWorkspaceSettings({
        db,
        args: {},
        cameraKeyframes: validated,
    });
    return validated;
}

/**
 * Replaces the flag and rifle moves stored in the show file, leaving the other
 * workspace settings as they are.
 */
export async function updateWorkspaceEquipmentMoves({
    db,
    moves,
}: {
    db: DbConnection;
    moves: WorkspaceEquipmentMove[];
}): Promise<WorkspaceEquipmentMove[]> {
    const validated = z.array(equipmentMoveSchema).parse(moves);
    await updateWorkspaceSettings({
        db,
        args: {},
        equipmentMoves: validated,
    });
    return validated;
}

/** Performer motion clips and the cues that play them. */
export interface WorkspaceMotion {
    clips: WorkspaceMotionClip[];
    cues: WorkspaceMotionCue[];
}

/**
 * Replaces the motion clips and cues stored in the show file together (so
 * deleting a clip and its cues is one save), leaving the other workspace
 * settings as they are.
 */
export async function updateWorkspaceMotion({
    db,
    motion,
}: {
    db: DbConnection;
    motion: WorkspaceMotion;
}): Promise<WorkspaceMotion> {
    const validated = {
        clips: z.array(motionClipSchema).parse(motion.clips),
        cues: z.array(motionCueSchema).parse(motion.cues),
    };
    await updateWorkspaceSettings({
        db,
        args: {},
        motionClips: validated.clips,
        motionCues: validated.cues,
    });
    return validated;
}
