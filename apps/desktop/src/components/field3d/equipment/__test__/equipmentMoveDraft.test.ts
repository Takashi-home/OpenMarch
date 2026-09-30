import { describe, expect, it } from "vitest";
import type { EquipmentMove } from "../../scene/equipmentMoves";
import {
    draftFromMove,
    EquipmentMoveDraft,
    marcherChoice,
    movesFromDraft,
    newDraft,
    sectionChoice,
    SELECTION_TARGET,
    withMoves,
} from "../equipmentMoveDraft";

const context = { pageId: 3, selectedMarcherIds: [10, 11] };

const valid = (overrides: Partial<EquipmentMoveDraft> = {}) => ({
    ...newDraft(sectionChoice("Flag")),
    ...overrides,
});

const move = (id: string): EquipmentMove => ({
    id,
    target: { kind: "section", section: "Flag" },
    pageId: 3,
    startCount: 0,
    lengthCounts: 4,
    move: "toss",
    turns: 1,
    direction: "cw",
});

describe("movesFromDraft", () => {
    it("turns the default draft into a move for the section on the page", () => {
        const [made, ...rest] = movesFromDraft(valid(), context)!;
        expect(rest).toEqual([]);
        expect(made).toMatchObject({
            target: { kind: "section", section: "Flag" },
            pageId: 3,
            startCount: 0,
            lengthCounts: 4,
            move: "toss",
            turns: 1,
            direction: "cw",
        });
        expect(made.id).not.toBe("");
    });

    it("reads numbers typed as text", () => {
        const [made] = movesFromDraft(
            valid({ startCount: "2.5", lengthCounts: " 8 ", turns: "3" }),
            context,
        )!;
        expect(made.startCount).toBe(2.5);
        expect(made.lengthCounts).toBe(8);
        expect(made.turns).toBe(3);
    });

    it("gives the move to each selected marcher, with its own ID", () => {
        const made = movesFromDraft(
            valid({ target: SELECTION_TARGET }),
            context,
        )!;
        expect(made.map((m) => m.target)).toEqual([
            { kind: "marcher", marcherId: 10 },
            { kind: "marcher", marcherId: 11 },
        ]);
        expect(new Set(made.map((m) => m.id)).size).toBe(2);
    });

    it("has nothing to make when no marcher is selected", () => {
        expect(
            movesFromDraft(valid({ target: SELECTION_TARGET }), {
                pageId: 3,
                selectedMarcherIds: [],
            }),
        ).toBeNull();
    });

    it("targets one marcher", () => {
        const [made] = movesFromDraft(
            valid({ target: marcherChoice(7) }),
            context,
        )!;
        expect(made.target).toEqual({ kind: "marcher", marcherId: 7 });
    });

    it("keeps the ID of the move being edited", () => {
        const [made] = movesFromDraft(valid(), {
            ...context,
            existingId: "keep",
        })!;
        expect(made.id).toBe("keep");
    });

    it.each([
        ["an empty start", { startCount: "" }],
        ["a negative start", { startCount: "-1" }],
        ["text for the start", { startCount: "soon" }],
        ["no length", { lengthCounts: "0" }],
        ["a length that is too long", { lengthCounts: "65" }],
        ["no turns", { turns: "0" }],
        ["too many turns", { turns: "17" }],
        ["an unknown target", { target: "everyone" }],
        ["a section with no name", { target: sectionChoice("") }],
        ["a marcher that is not a number", { target: "marcher:abc" }],
    ] as const)("rejects %s", (_name, overrides) => {
        expect(movesFromDraft(valid(overrides), context)).toBeNull();
    });
});

describe("draftFromMove", () => {
    it("round-trips through the form", () => {
        const original: EquipmentMove = {
            ...move("a"),
            target: { kind: "marcher", marcherId: 7 },
            startCount: 1.5,
            lengthCounts: 6,
            move: "sweep",
            turns: 2,
            direction: "ccw",
        };
        const [made] = movesFromDraft(draftFromMove(original), {
            ...context,
            existingId: "a",
        })!;
        expect(made).toEqual(original);
    });
});

describe("withMoves", () => {
    const list = [move("a"), move("b"), move("c")];

    it("adds new moves at the end", () => {
        expect(withMoves(list, [move("d")]).map((m) => m.id)).toEqual([
            "a",
            "b",
            "c",
            "d",
        ]);
    });

    it("puts an edited move back where it was", () => {
        const edited = withMoves(list, [{ ...move("b"), turns: 4 }], "b");
        expect(edited.map((m) => m.id)).toEqual(["a", "b", "c"]);
        expect(edited[1].turns).toBe(4);
    });

    it("adds at the end when the edited move is gone", () => {
        expect(
            withMoves(list, [move("z")], "missing").map((m) => m.id),
        ).toEqual(["a", "b", "c", "z"]);
    });
});
