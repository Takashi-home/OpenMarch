// cspell:ignore AQID
import { describe, expect, it } from "vitest";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import type Page from "@/global/classes/Page";
import type { MarcherTimeline } from "@/utilities/Keyframes";
import { getFieldWorldBounds } from "../../camera/defaultCamera";
import { fieldToWorld } from "../../coords/fieldToWorld";
import {
    buildSharePackage,
    SHARE_FORMAT,
    SHARE_FORMAT_VERSION,
    SHARE_FPS,
    SharePackage,
} from "../sharePackage";
import { shareFileName } from "../exportSharePackage";

const field = FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
const c = field.centerFrontPoint;
const step = field.pixelsPerStep;
const beats = (count: number) =>
    Array.from({ length: count }, () => ({ duration: 0.5 }));

// Page 1 is the starting set; page 2 lasts 4 s (8 counts)
const pages = [
    { id: 1, name: "1", timestamp: 0, duration: 0, beats: [], nextPageId: 2 },
    {
        id: 2,
        name: "2",
        timestamp: 0,
        duration: 4,
        beats: beats(8),
        counts: 8,
        nextPageId: null,
    },
] as unknown as Page[];

const start = { x: c.xPixels, y: c.yPixels - 20 * step };
const end = { x: c.xPixels + 16 * step, y: start.y };
const timelines = new Map<number, MarcherTimeline>([
    [
        1,
        {
            pathMap: new Map([
                [0, start],
                [4000, end],
            ]),
            sortedTimestamps: [0, 4000],
        },
    ],
]);

function build(): SharePackage {
    return buildSharePackage({
        title: "Finale",
        fieldProperties: field,
        fieldImage: "data:image/jpeg;base64,AAAA",
        sortedPages: pages,
        marchers: [
            { id: 1, drill_number: "F1", section: "Flag" },
            { id: 2, drill_number: "T1", section: "Trumpet" },
        ],
        marcherTimelines: timelines,
        // Marcher 2 is hidden on page 2
        marcherAppearancesByPageId: new Map([
            [2, { 2: [{ visible: false, label_visible: false }] }],
        ]),
        equipmentMoves: [
            {
                id: "m1",
                target: { kind: "section", section: "Flag" },
                pageId: 2,
                startCount: 2,
                lengthCounts: 4,
                move: "toss",
                turns: 1,
                direction: "cw",
            },
        ],
        motionClips: [
            { id: "unused", name: "b", fps: 30, frameCount: 1, data: "AAAA" },
        ],
        motionCues: [],
        audio: {
            mimeType: "audio/mpeg",
            bytes: new Uint8Array([1, 2, 3]).buffer,
            offsetSeconds: 0.5,
        },
        now: new Date("2026-10-03T12:00:00.000Z"),
    });
}

/** Marcher `index`'s pose at `frame`, back in world meters. */
function poseAt(pack: SharePackage, frame: number, index: number) {
    const bytes = Uint8Array.from(atob(pack.frames), (ch) => ch.charCodeAt(0));
    const view = new DataView(bytes.buffer);
    const offset = (frame * pack.marchers.length + index) * 6;
    return {
        x: view.getInt16(offset, true) / 100 + pack.field.bounds.centerX,
        z: view.getInt16(offset + 2, true) / 100 + pack.field.bounds.centerZ,
        yaw: view.getInt16(offset + 4, true) / 10_000,
    };
}

describe("buildSharePackage", () => {
    it("labels the file with its format and version", () => {
        const pack = build();
        expect(pack.format).toBe(SHARE_FORMAT);
        expect(pack.version).toBe(SHARE_FORMAT_VERSION);
        expect(pack.exportedAt).toBe("2026-10-03T12:00:00.000Z");
        expect(pack.durationMs).toBe(4000);
        expect(pack.fps).toBe(SHARE_FPS);
    });

    it("samples positions in world meters, to the centimeter", () => {
        const pack = build();
        const frames = atob(pack.frames).length / (pack.marchers.length * 6);
        expect(frames).toBe(4 * SHARE_FPS + 1);
        // Halfway through page 2
        const pose = poseAt(pack, 2 * SHARE_FPS, 0);
        const expected = fieldToWorld(
            { x: (start.x + end.x) / 2, y: start.y },
            field,
        );
        expect(pose.x).toBeCloseTo(expected.x, 1);
        expect(pose.z).toBeCloseTo(expected.z, 1);
        // Walking toward +X (the audience's right)
        expect(pose.yaw).toBeCloseTo(Math.PI / 2, 1);
        expect(pack.field.bounds.width).toBeCloseTo(
            getFieldWorldBounds(field).width,
            6,
        );
    });

    it("keeps each page's look, with hidden marchers as null", () => {
        const pack = build();
        const last = pack.appearances[pack.appearances.length - 1];
        expect(last.marchers[0]).toMatchObject({ shape: expect.any(String) });
        expect(last.marchers[1]).toBeNull();
    });

    it("gives the flags their equipment and resolves move times", () => {
        const pack = build();
        expect(pack.marchers.map((m) => m.equipment)).toEqual(["flag", null]);
        expect(pack.equipmentMoves[0]).toMatchObject({
            startMs: 1000,
            endMs: 3000,
        });
    });

    it("leaves out motions no cue plays, and carries the audio", () => {
        const pack = build();
        expect(pack.motion.clips).toEqual([]);
        expect(pack.audio).toEqual({
            mimeType: "audio/mpeg",
            data: "AQID",
            offsetSeconds: 0.5,
        });
    });
});

describe("shareFileName", () => {
    it("makes a safe file name from the title", () => {
        expect(shareFileName('Finale: "Act 2"')).toBe(
            "Finale- -Act 2-.omview.json",
        );
        expect(shareFileName("  ")).toBe("show.omview.json");
    });
});
