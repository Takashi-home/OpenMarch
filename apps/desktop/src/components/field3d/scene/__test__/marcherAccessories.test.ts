import { describe, expect, it } from "vitest";
import { InstancedMesh, Matrix4, Vector3 } from "three";
import { createGaitTracker, MAX_SWING, STEP_METERS } from "../gait";
import { equipmentForSection } from "../equipment";
import {
    accessoryMarchers,
    createMarcherAccessories,
} from "../marcherAccessories";
import { MarcherInstancesByShape } from "../marcherInstances";

const gray = { r: 0.5, g: 0.5, b: 0.5 };

describe("createGaitTracker", () => {
    it("does not swing a marcher standing still", () => {
        const gait = createGaitTracker();
        gait.update(1, 0, 0, 0);
        for (let i = 0; i < 30; i++)
            expect(gait.update(1, 0, 0, 1 / 30)).toBe(0);
        expect(gait.isSettled()).toBe(true);
    });

    it("swings the legs while walking, one cycle every two steps", () => {
        const gait = createGaitTracker();
        const speed = 1.4; // meters per second
        const dt = 1 / 60;
        let x = 0;
        gait.update(1, x, 0, 0);
        let largest = 0;
        let signChanges = 0;
        let previous = 0;
        const frames = Math.round((STEP_METERS * 8) / (speed * dt));
        for (let i = 0; i < frames; i++) {
            x += speed * dt;
            const swing = gait.update(1, x, 0, dt);
            largest = Math.max(largest, Math.abs(swing));
            if (i > 30 && Math.sign(swing) !== Math.sign(previous))
                signChanges++;
            previous = swing;
        }
        expect(largest).toBeGreaterThan(MAX_SWING * 0.8);
        expect(largest).toBeLessThanOrEqual(MAX_SWING + 1e-9);
        // About one sign change per step
        expect(signChanges).toBeGreaterThanOrEqual(6);
        expect(signChanges).toBeLessThanOrEqual(8);
        expect(gait.isSettled()).toBe(false);
    });

    it("settles after the marcher stops", () => {
        const gait = createGaitTracker();
        gait.update(1, 0, 0, 0);
        for (let i = 1; i <= 30; i++) gait.update(1, i * 0.05, 0, 1 / 30);
        for (let i = 0; i < 60; i++) gait.update(1, 1.5, 0, 1 / 30);
        expect(gait.isSettled()).toBe(true);
    });

    it("ignores jumps between pages", () => {
        const gait = createGaitTracker();
        gait.update(1, 0, 0, 0);
        expect(gait.update(1, 30, 0, 1 / 60)).toBe(0);
    });
});

describe("equipmentForSection", () => {
    it("gives the guard and percussion their equipment", () => {
        expect(equipmentForSection("Flag")).toBe("flag");
        expect(equipmentForSection("Rifle")).toBe("rifle");
        expect(equipmentForSection("Snare")).toBe("drum");
        expect(equipmentForSection("Marimba")).toBe("keyboard");
        expect(equipmentForSection("Trumpet")).toBeNull();
    });
});

describe("createMarcherAccessories", () => {
    const instances: MarcherInstancesByShape = {
        circle: [
            {
                marcherId: 1,
                x: 0,
                z: 0,
                yaw: 0,
                color: gray,
                labelVisible: true,
            },
        ],
        square: [
            {
                marcherId: 2,
                x: 5,
                z: 0,
                yaw: 0,
                color: gray,
                labelVisible: true,
            },
        ],
        triangle: [],
        cross: [],
    };
    const marchers = accessoryMarchers(
        instances,
        new Map([
            [1, "Flag"],
            [2, "Trumpet"],
        ]),
    );

    it("draws legs for every shown marcher and equipment only for its section", () => {
        const accessories = createMarcherAccessories({
            capacity: 2,
            legs: true,
            equipment: true,
            castShadow: false,
        });
        accessories.setMarchers(marchers);
        accessories.update(
            new Map([
                [1, { x: 0, z: 0, yaw: 0 }],
                [2, { x: 5, z: 0, yaw: 0 }],
            ]),
            1 / 60,
            1,
        );
        const counts = accessories.object.children.map(
            (child) => (child as InstancedMesh).count,
        );
        // Left leg, right leg, flag pole, flag silk, rifle, drum, keyboard
        expect(counts).toEqual([2, 2, 1, 1, 0, 0, 0]);
        accessories.dispose();
    });

    it("places parts at the marcher and turns them with its facing", () => {
        const accessories = createMarcherAccessories({
            capacity: 1,
            legs: true,
            equipment: false,
            castShadow: false,
        });
        accessories.setMarchers(marchers.slice(0, 1));
        accessories.update(
            new Map([[1, { x: 3, z: -2, yaw: Math.PI / 2 }]]),
            0,
            1,
        );
        const leftLeg = accessories.object.children[0] as InstancedMesh;
        const matrix = new Matrix4();
        leftLeg.getMatrixAt(0, matrix);
        const hip = new Vector3().setFromMatrixPosition(matrix);
        // The left hip sits beside the marcher; turned 90°, "left" is along Z
        expect(hip.x).toBeCloseTo(3);
        expect(hip.y).toBeCloseTo(0.85);
        expect(Math.abs(hip.z - -2)).toBeCloseTo(0.11);
        accessories.dispose();
    });

    describe("equipment moves", () => {
        const poses = new Map([
            [1, { x: 0, z: 0, yaw: 0 }],
            [2, { x: 5, z: 0, yaw: 0 }],
        ]);
        const toss = {
            move: {
                id: "t",
                target: { kind: "section" as const, section: "Flag" },
                pageId: 1,
                startCount: 0,
                lengthCounts: 4,
                move: "toss" as const,
                turns: 2,
                direction: "cw" as const,
            },
            startMs: 0,
            endMs: 2000,
        };
        // Without legs the meshes are: pole, silk, rifle, drum, keyboard
        const setup = () => {
            const accessories = createMarcherAccessories({
                capacity: 2,
                legs: false,
                equipment: true,
                castShadow: false,
            });
            accessories.setMarchers(marchers);
            accessories.setMoves([toss]);
            const pole = accessories.object.children[0] as InstancedMesh;
            const poleHeight = () => {
                const matrix = new Matrix4();
                pole.getMatrixAt(0, matrix);
                return new Vector3().setFromMatrixPosition(matrix).y;
            };
            return { accessories, poleHeight };
        };

        it("lifts a tossed flag at the peak and drops it back into the hold", () => {
            const { accessories, poleHeight } = setup();
            accessories.update(poses, 1 / 60, 1, 0);
            const hold = poleHeight();
            accessories.update(poses, 1 / 60, 1, 1000);
            // Two seconds in the air peaks near 4.9 m; two whole turns end upright
            expect(poleHeight() - hold).toBeCloseTo(4.905, 2);
            accessories.update(poses, 1 / 60, 1, 2000);
            expect(poleHeight()).toBeCloseTo(hold);
            accessories.dispose();
        });

        it("keeps equipment in its hold when no show time is given", () => {
            const { accessories, poleHeight } = setup();
            accessories.update(poses, 1 / 60, 1);
            const hold = poleHeight();
            accessories.update(poses, 1 / 60, 1, 1000);
            expect(poleHeight()).toBeGreaterThan(hold);
            accessories.update(poses, 1 / 60, 1);
            expect(poleHeight()).toBeCloseTo(hold);
            accessories.dispose();
        });

        it("does not move equipment outside the move's section", () => {
            const accessories = createMarcherAccessories({
                capacity: 2,
                legs: false,
                equipment: true,
                castShadow: false,
            });
            accessories.setMarchers(
                accessoryMarchers(
                    instances,
                    new Map([
                        [1, "Flag"],
                        [2, "Rifle"],
                    ]),
                ),
            );
            accessories.setMoves([toss]);
            const rifle = accessories.object.children[2] as InstancedMesh;
            const rifleHeight = () => {
                const matrix = new Matrix4();
                rifle.getMatrixAt(0, matrix);
                return new Vector3().setFromMatrixPosition(matrix).y;
            };
            accessories.update(poses, 1 / 60, 1);
            const hold = rifleHeight();
            accessories.update(poses, 1 / 60, 1, 1000);
            expect(rifle.count).toBe(1);
            expect(rifleHeight()).toBeCloseTo(hold);
            accessories.dispose();
        });
    });

    it("skips legs for the simple model", () => {
        const accessories = createMarcherAccessories({
            capacity: 2,
            legs: false,
            equipment: true,
            castShadow: false,
        });
        accessories.setMarchers(marchers);
        const stillMoving = accessories.update(
            new Map([[1, { x: 0, z: 0, yaw: 0 }]]),
            1 / 60,
            1,
        );
        expect(stillMoving).toBe(false);
        expect(accessories.object.children).toHaveLength(5);
        accessories.dispose();
    });
});
