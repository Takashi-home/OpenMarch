import { describe, expect, it } from "vitest";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import type Page from "@/global/classes/Page";
import type { MarcherTimeline } from "@/utilities/Keyframes";
import { fieldToWorld } from "../../coords/fieldToWorld";
import {
    followCameraPose,
    getCameraPresetPose,
} from "../../camera/cameraPresets";
import { createExportAnimation } from "../exportAnimation";

const field = FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
const c = field.centerFrontPoint;
const step = field.pixelsPerStep;

// Page 1 is the starting set; page 2 lasts 4 s; page 3 lasts 4 s
const pages = [
    { id: 1, timestamp: 0, duration: 0, nextPageId: 2 },
    { id: 2, timestamp: 0, duration: 4, nextPageId: 3 },
    { id: 3, timestamp: 4, duration: 4, nextPageId: null },
] as unknown as Page[];

const start = { x: c.xPixels, y: c.yPixels - 20 * step };
const middle = { x: c.xPixels + 16 * step, y: start.y };
const end = { x: middle.x, y: c.yPixels - 36 * step };

const timelines = new Map<number, MarcherTimeline>([
    [
        1,
        {
            pathMap: new Map([
                [0, start],
                [4000, middle],
                [8000, end],
            ]),
            sortedTimestamps: [0, 4000, 8000],
        },
    ],
    [
        2,
        {
            pathMap: new Map([
                [0, { x: c.xPixels, y: c.yPixels - 10 * step }],
                [4000, { x: c.xPixels, y: c.yPixels - 10 * step }],
            ]),
            sortedTimestamps: [0, 4000],
        },
    ],
]);

const create = (
    camera: Parameters<typeof createExportAnimation>[0]["camera"],
) =>
    createExportAnimation({
        fieldProperties: field,
        sortedPages: pages,
        marcherIds: [1, 2],
        marcherTimelines: timelines,
        marcherAppearancesByPageId: new Map([
            // Marcher 2 is hidden on page 2, which is shown while moving to page 3
            [2, { 2: [{ visible: false, label_visible: false }] }],
        ]),
        camera,
    });

const run = (
    animation: ReturnType<typeof create>,
    untilMs: number,
    fps = 30,
) => {
    let frame = animation.frameAt(0, 1 / fps);
    for (let t = 1000 / fps; t <= untilMs; t += 1000 / fps)
        frame = animation.frameAt(t, 1 / fps);
    return frame;
};

describe("createExportAnimation", () => {
    it("moves marchers along their timelines in world meters", () => {
        const animation = create({ kind: "preset", preset: "press-box" });
        const frame = run(animation, 2000);
        const expected = fieldToWorld(
            { x: (start.x + middle.x) / 2, y: start.y },
            field,
        );
        const pose = frame.poses.get(1)!;
        expect(pose.x).toBeCloseTo(expected.x, 1);
        expect(pose.z).toBeCloseTo(expected.z, 5);
        // Moving toward +X (the audience's right)
        expect(pose.yaw).toBeCloseTo(Math.PI / 2, 1);
    });

    it("keeps a marcher at its last spot after its timeline ends", () => {
        const animation = create({ kind: "preset", preset: "press-box" });
        const lastSpot = fieldToWorld(
            { x: c.xPixels, y: c.yPixels - 10 * step },
            field,
        );
        const frame = run(animation, 6000);
        expect(frame.poses.get(2)!.z).toBeCloseTo(lastSpot.z);
    });

    it("uses the appearance of the page being left, as the 2D export does", () => {
        const animation = create({ kind: "preset", preset: "press-box" });
        const shown = (frame: ReturnType<typeof animation.frameAt>) =>
            frame.instancesByShape.circle.map((i) => i.marcherId);

        expect(shown(run(animation, 2000))).toEqual([1, 2]);
        expect(shown(run(animation, 6000))).toEqual([1]);
    });

    it("holds a preset camera still", () => {
        const animation = create({ kind: "preset", preset: "end-zone" });
        const pose = getCameraPresetPose("end-zone", field);
        expect(run(animation, 1000).camera).toEqual(pose);
        expect(run(animation, 3000).camera).toEqual(pose);
    });

    it("follows a marcher and catches up with it", () => {
        const animation = create({ kind: "follow", marcherId: 1 });
        const frame = run(animation, 7990);
        const desired = followCameraPose(frame.poses.get(1)!);
        // Moving marchers are followed closely, not exactly
        expect(frame.camera.target[0]).toBeCloseTo(desired.target[0], 0);
        expect(frame.camera.target[2]).toBeCloseTo(desired.target[2], 0);
    });

    it("produces the same frames for the same input", () => {
        const first = create({ kind: "follow", marcherId: 1 });
        const second = create({ kind: "follow", marcherId: 1 });
        for (let t = 0; t < 8000; t += 250) {
            const a = first.frameAt(t, 1 / 4);
            const b = second.frameAt(t, 1 / 4);
            expect(a.camera).toEqual(b.camera);
            expect([...a.poses]).toEqual([...b.poses]);
        }
    });
});
