import { describe, expect } from "vitest";
import {
    getWorkspaceSettingsJSON,
    getWorkspaceSettingsParsed,
    updateWorkspaceCameraKeyframes,
    updateWorkspaceEquipmentMoves,
    updateWorkspaceMotion,
    updateWorkspaceSettingsJSON,
    updateWorkspaceSettingsParsed,
    WorkspaceEquipmentMove,
    WorkspaceMotionClip,
    WorkspaceMotionCue,
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

const equipmentMove = (id: string): WorkspaceEquipmentMove => ({
    id,
    target: { kind: "section", section: "Flag" },
    pageId: 2,
    startCount: 0,
    lengthCounts: 4,
    move: "toss",
    turns: 2,
    direction: "cw",
});

describeDbTests("workspaceSettings equipment moves", (it) => {
    it("saves moves in the show file and reads them back", async ({ db }) => {
        await updateWorkspaceEquipmentMoves({
            db,
            moves: [
                equipmentMove("a"),
                {
                    ...equipmentMove("b"),
                    target: { kind: "marcher", marcherId: 7 },
                    move: "sweep",
                },
            ],
        });

        const settings = await getWorkspaceSettingsParsed({ db });
        expect(settings.equipmentMoves?.map((m) => m.id)).toEqual(["a", "b"]);
        expect(settings.equipmentMoves?.[1].target).toEqual({
            kind: "marcher",
            marcherId: 7,
        });
        expect(settings.defaultTempo).toBe(120);
    });

    it("keeps moves when other settings are saved without them", async ({
        db,
    }) => {
        await updateWorkspaceEquipmentMoves({
            db,
            moves: [equipmentMove("a")],
        });
        const { equipmentMoves: _omitted, ...rest } =
            await getWorkspaceSettingsParsed({ db });

        await updateWorkspaceSettingsParsed({
            db,
            settings: { ...rest, projectName: "Finale" },
        });

        const settings = await getWorkspaceSettingsParsed({ db });
        expect(settings.projectName).toBe("Finale");
        expect(settings.equipmentMoves?.map((m) => m.id)).toEqual(["a"]);
    });

    it("does not roll moves back when a settings form holds an older copy", async ({
        db,
    }) => {
        await updateWorkspaceEquipmentMoves({
            db,
            moves: [equipmentMove("old")],
        });
        const stale = await getWorkspaceSettingsParsed({ db });
        await updateWorkspaceEquipmentMoves({
            db,
            moves: [equipmentMove("new")],
        });

        await updateWorkspaceSettingsParsed({
            db,
            settings: { ...stale, designer: "Kim" },
        });

        const settings = await getWorkspaceSettingsParsed({ db });
        expect(settings.designer).toBe("Kim");
        expect(settings.equipmentMoves?.map((m) => m.id)).toEqual(["new"]);
    });

    it("saving moves does not disturb the camera keyframes, and the reverse", async ({
        db,
    }) => {
        await updateWorkspaceCameraKeyframes({
            db,
            keyframes: [keyframe("cam", 0)],
        });
        await updateWorkspaceEquipmentMoves({
            db,
            moves: [equipmentMove("a")],
        });
        await updateWorkspaceCameraKeyframes({
            db,
            keyframes: [keyframe("cam2", 500)],
        });

        const settings = await getWorkspaceSettingsParsed({ db });
        expect(settings.cameraKeyframes?.map((k) => k.id)).toEqual(["cam2"]);
        expect(settings.equipmentMoves?.map((m) => m.id)).toEqual(["a"]);
    });

    it("removes the key when every move is deleted", async ({ db }) => {
        await updateWorkspaceEquipmentMoves({
            db,
            moves: [equipmentMove("a")],
        });
        await updateWorkspaceEquipmentMoves({ db, moves: [] });

        const json = JSON.parse(await getWorkspaceSettingsJSON({ db }));
        expect(json).not.toHaveProperty("equipmentMoves");
    });

    it("rejects malformed moves", async ({ db }) => {
        await expect(
            updateWorkspaceEquipmentMoves({
                db,
                moves: [{ ...equipmentMove("a"), lengthCounts: 0 }],
            }),
        ).rejects.toThrow();
        await expect(
            updateWorkspaceEquipmentMoves({
                db,
                moves: [{ ...equipmentMove("a"), turns: 99 }],
            }),
        ).rejects.toThrow();
    });
});

const motionClip = (id: string): WorkspaceMotionClip => ({
    id,
    name: `${id}.bvh`,
    fps: 30,
    frameCount: 1,
    data: "AAAA",
});

const motionCue = (id: string, clipId: string): WorkspaceMotionCue => ({
    id,
    clipId,
    target: { kind: "section", section: "Color Guard" },
    pageId: 2,
    startCount: 4,
    lengthCounts: 16,
    mirror: false,
    propHand: "left",
});

describeDbTests("workspaceSettings performer motions", (it) => {
    it("saves clips and cues in the show file and reads them back", async ({
        db,
    }) => {
        await updateWorkspaceMotion({
            db,
            motion: {
                clips: [motionClip("solo")],
                cues: [motionCue("q1", "solo")],
            },
        });

        const settings = await getWorkspaceSettingsParsed({ db });
        expect(settings.motionClips?.map((c) => c.id)).toEqual(["solo"]);
        expect(settings.motionCues?.[0]).toMatchObject({
            clipId: "solo",
            startCount: 4,
            propHand: "left",
        });
        expect(settings.defaultTempo).toBe(120);
    });

    it("keeps motions when other settings are saved without them", async ({
        db,
    }) => {
        await updateWorkspaceMotion({
            db,
            motion: {
                clips: [motionClip("solo")],
                cues: [motionCue("q1", "solo")],
            },
        });
        const {
            motionClips: _clips,
            motionCues: _cues,
            ...rest
        } = await getWorkspaceSettingsParsed({ db });

        await updateWorkspaceSettingsParsed({
            db,
            settings: { ...rest, projectName: "Finale" },
        });

        const settings = await getWorkspaceSettingsParsed({ db });
        expect(settings.projectName).toBe("Finale");
        expect(settings.motionClips?.map((c) => c.id)).toEqual(["solo"]);
        expect(settings.motionCues?.map((c) => c.id)).toEqual(["q1"]);
    });

    it("does not disturb equipment moves or camera keyframes", async ({
        db,
    }) => {
        await updateWorkspaceEquipmentMoves({
            db,
            moves: [equipmentMove("a")],
        });
        await updateWorkspaceCameraKeyframes({
            db,
            keyframes: [keyframe("cam", 0)],
        });
        await updateWorkspaceMotion({
            db,
            motion: { clips: [motionClip("solo")], cues: [] },
        });

        const settings = await getWorkspaceSettingsParsed({ db });
        expect(settings.equipmentMoves?.map((m) => m.id)).toEqual(["a"]);
        expect(settings.cameraKeyframes?.map((k) => k.id)).toEqual(["cam"]);
        expect(settings.motionClips?.map((c) => c.id)).toEqual(["solo"]);
    });

    it("removes the keys when every clip and cue is deleted", async ({
        db,
    }) => {
        await updateWorkspaceMotion({
            db,
            motion: {
                clips: [motionClip("solo")],
                cues: [motionCue("q1", "solo")],
            },
        });
        await updateWorkspaceMotion({ db, motion: { clips: [], cues: [] } });

        const json = JSON.parse(await getWorkspaceSettingsJSON({ db }));
        expect(json).not.toHaveProperty("motionClips");
        expect(json).not.toHaveProperty("motionCues");
    });

    it("rejects malformed clips and cues", async ({ db }) => {
        await expect(
            updateWorkspaceMotion({
                db,
                motion: {
                    clips: [{ ...motionClip("solo"), data: "not base64!" }],
                    cues: [],
                },
            }),
        ).rejects.toThrow();
        await expect(
            updateWorkspaceMotion({
                db,
                motion: {
                    clips: [],
                    cues: [{ ...motionCue("q1", "solo"), lengthCounts: 0 }],
                },
            }),
        ).rejects.toThrow();
    });
});

describe("parseWorkspaceSettings", () => {
    it("drops only broken motion clips and cues", () => {
        const settings = parseWorkspaceSettings(
            JSON.stringify({
                defaultTempo: 96,
                motionClips: [motionClip("good"), { id: "bad", fps: -1 }],
                motionCues: [
                    motionCue("q-good", "good"),
                    { ...motionCue("q-bad", "good"), propHand: "foot" },
                ],
            }),
        );
        expect(settings.defaultTempo).toBe(96);
        expect(settings.motionClips?.map((c) => c.id)).toEqual(["good"]);
        expect(settings.motionCues?.map((c) => c.id)).toEqual(["q-good"]);
    });

    it("drops only broken moves and keeps the other settings", () => {
        const settings = parseWorkspaceSettings(
            JSON.stringify({
                defaultTempo: 96,
                equipmentMoves: [
                    equipmentMove("good"),
                    { ...equipmentMove("bad"), move: "juggle" },
                    { id: "worse" },
                ],
            }),
        );
        expect(settings.defaultTempo).toBe(96);
        expect(settings.equipmentMoves?.map((m) => m.id)).toEqual(["good"]);
    });

    it("ignores a moves value that is not a list", () => {
        const settings = parseWorkspaceSettings(
            JSON.stringify({ defaultTempo: 96, equipmentMoves: "oops" }),
        );
        expect(settings.defaultTempo).toBe(96);
        expect(settings.equipmentMoves).toBeUndefined();
    });

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
