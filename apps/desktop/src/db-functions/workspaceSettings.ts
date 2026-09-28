import { eq } from "drizzle-orm";
import * as z from "zod";
import { DbConnection, DbTransaction } from "./types";
import { schema } from "@/global/database/db";
import {
    cameraKeyframeSchema,
    workspaceSettingsSchema,
} from "@/settings/workspaceSettings";

export type WorkspaceCameraKeyframe = z.infer<typeof cameraKeyframeSchema>;

/** The camera keyframes stored in a workspace settings JSON string. */
function storedCameraKeyframes(
    jsonData: string | undefined,
): WorkspaceCameraKeyframe[] | undefined {
    if (!jsonData) return undefined;
    try {
        // Only the keyframes are checked, so an unrelated bad setting cannot lose them
        const stored = (JSON.parse(jsonData) as { cameraKeyframes?: unknown })
            ?.cameraKeyframes;
        return workspaceSettingsSchema.shape.cameraKeyframes.parse(stored);
    } catch {
        return undefined;
    }
}

/**
 * Sets the camera keyframes in a workspace settings JSON string, removing the
 * key when there are none.
 */
function withCameraKeyframes(
    jsonData: string,
    keyframes: WorkspaceCameraKeyframe[] | undefined,
): string {
    const settings = JSON.parse(jsonData) as Record<string, unknown>;
    if (keyframes && keyframes.length > 0) settings.cameraKeyframes = keyframes;
    else delete settings.cameraKeyframes;
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
 * Camera keyframes are kept as stored unless `cameraKeyframes` is given, so
 * settings forms that do not know about them (or hold an older copy) never
 * drop or roll them back.
 */
export async function updateWorkspaceSettings({
    db,
    args,
    cameraKeyframes,
}: {
    db: DbConnection;
    args: ModifiedWorkspaceSettingsArgs;
    /** New camera keyframes; leave out to keep the stored ones */
    cameraKeyframes?: WorkspaceCameraKeyframe[];
}): Promise<DatabaseWorkspaceSettings> {
    // Initialize the workspace settings record if it doesn't exist
    await initializeWorkspaceSettings({ db });

    return await db.transaction(async (tx: DbTransaction) => {
        const current = await tx.query.workspace_settings.findFirst();
        const jsonData = args.json_data ?? current?.json_data;
        const keyframes =
            cameraKeyframes ?? storedCameraKeyframes(current?.json_data);
        await tx
            .update(schema.workspace_settings)
            .set({
                ...args,
                ...(jsonData !== undefined
                    ? { json_data: withCameraKeyframes(jsonData, keyframes) }
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
