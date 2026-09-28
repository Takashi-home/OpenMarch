import { describe, expect } from "vitest";
import {
    getWorkspaceSettingsJSON,
    getWorkspaceSettingsParsed,
    updateWorkspaceCameraKeyframes,
    updateWorkspaceSettingsJSON,
    updateWorkspaceSettingsParsed,
} from "../workspaceSettings";
import { describeDbTests, schema } from "@/test/base";
import { parseWorkspaceSettings } from "@/settings/workspaceSettings";

const keyframe = (id: string, timeMs: number) => ({
    id,
    timeMs,
    pose: {
        position: [0, 10, 20] as [number, number, number],
        target: [0, 0, 0] as [number, number, number],
        fov: 50,
    },
});

describeDbTests("workspaceSettings camera keyframes", (it) => {
    it("saves keyframes in the show file and reads them back", async ({
        db,
    }) => {
        await updateWorkspaceCameraKeyframes({
            db,
            keyframes: [keyframe("a", 0), keyframe("b", 4000)],
        });

        const settings = await getWorkspaceSettingsParsed({ db });
        expect(settings.cameraKeyframes?.map((k) => k.id)).toEqual(["a", "b"]);
        // Other settings are untouched
        expect(settings.defaultTempo).toBe(120);
    });

    it("keeps keyframes when other settings are saved without them", async ({
        db,
    }) => {
        await updateWorkspaceCameraKeyframes({
            db,
            keyframes: [keyframe("a", 1000)],
        });
        const { cameraKeyframes: _omitted, ...rest } =
            await getWorkspaceSettingsParsed({ db });

        await updateWorkspaceSettingsParsed({
            db,
            settings: { ...rest, projectName: "Finale" },
        });

        const settings = await getWorkspaceSettingsParsed({ db });
        expect(settings.projectName).toBe("Finale");
        expect(settings.cameraKeyframes?.map((k) => k.id)).toEqual(["a"]);
    });

    it("ignores an older copy of the keyframes in a settings save", async ({
        db,
    }) => {
        await updateWorkspaceCameraKeyframes({
            db,
            keyframes: [keyframe("old", 0)],
        });
        const stale = await getWorkspaceSettingsParsed({ db });
        await updateWorkspaceCameraKeyframes({
            db,
            keyframes: [keyframe("new", 0)],
        });

        // e.g. a settings form opened before the keyframes changed
        await updateWorkspaceSettingsParsed({
            db,
            settings: { ...stale, designer: "Kim" },
        });
        await updateWorkspaceSettingsJSON({
            db,
            jsonData: JSON.stringify({
                ...stale,
                designer: "Kim",
                client: "Band",
            }),
        });

        const settings = await getWorkspaceSettingsParsed({ db });
        expect(settings.designer).toBe("Kim");
        expect(settings.client).toBe("Band");
        expect(settings.cameraKeyframes?.map((k) => k.id)).toEqual(["new"]);
    });

    it("keeps keyframes even when another stored setting is invalid", async ({
        db,
    }) => {
        await updateWorkspaceCameraKeyframes({
            db,
            keyframes: [keyframe("a", 0)],
        });
        // An out-of-range tempo, as a file edited elsewhere might contain
        const json = JSON.parse(await getWorkspaceSettingsJSON({ db }));
        await db
            .update(schema.workspace_settings)
            .set({ json_data: JSON.stringify({ ...json, defaultTempo: -5 }) });

        await updateWorkspaceSettingsJSON({
            db,
            jsonData: JSON.stringify({ defaultTempo: 100 }),
        });

        const settings = await getWorkspaceSettingsParsed({ db });
        expect(settings.defaultTempo).toBe(100);
        expect(settings.cameraKeyframes?.map((k) => k.id)).toEqual(["a"]);
    });

    it("removes the key when every keyframe is deleted", async ({ db }) => {
        await updateWorkspaceCameraKeyframes({
            db,
            keyframes: [keyframe("a", 0)],
        });
        await updateWorkspaceCameraKeyframes({ db, keyframes: [] });

        const json = JSON.parse(await getWorkspaceSettingsJSON({ db }));
        expect(json).not.toHaveProperty("cameraKeyframes");
    });

    it("rejects malformed keyframes", async ({ db }) => {
        await expect(
            updateWorkspaceCameraKeyframes({
                db,
                keyframes: [
                    {
                        ...keyframe("a", 0),
                        pose: { ...keyframe("a", 0).pose, fov: 0 },
                    },
                ],
            }),
        ).rejects.toThrow();
    });
});

describe("parseWorkspaceSettings", () => {
    it("drops only broken keyframes and keeps the other settings", () => {
        const settings = parseWorkspaceSettings(
            JSON.stringify({
                defaultTempo: 96,
                cameraKeyframes: [
                    keyframe("good", 0),
                    { id: "bad", timeMs: "later" },
                ],
            }),
        );
        expect(settings.defaultTempo).toBe(96);
        expect(settings.cameraKeyframes?.map((k) => k.id)).toEqual(["good"]);
    });

    it("ignores a keyframes value that is not a list", () => {
        const settings = parseWorkspaceSettings(
            JSON.stringify({ defaultTempo: 96, cameraKeyframes: "oops" }),
        );
        expect(settings.defaultTempo).toBe(96);
        expect(settings.cameraKeyframes).toBeUndefined();
    });
});
