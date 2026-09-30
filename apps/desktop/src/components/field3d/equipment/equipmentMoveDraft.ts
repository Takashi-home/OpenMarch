import { equipmentForSection, equipmentRig } from "../scene/equipment";
import {
    EquipmentMove,
    EquipmentMoveKind,
    EquipmentMoveTarget,
    MAX_MOVE_COUNTS,
    MAX_MOVE_TURNS,
    newEquipmentMoveId,
    SpinDirection,
} from "../scene/equipmentMoves";

/**
 * The move form works on text, so half-typed numbers are allowed while
 * editing; `movesFromDraft` checks them when the move is saved.
 */
export interface EquipmentMoveDraft {
    /** A `targetChoice` value: a section, one marcher, or the selection */
    target: string;
    move: EquipmentMoveKind;
    startCount: string;
    lengthCounts: string;
    turns: string;
    direction: SpinDirection;
}

/** The marchers whose equipment can toss, spin or sweep (flags and rifles). */
export function movableMarchers<T extends { section: string }>(
    marchers: readonly T[],
): T[] {
    return marchers.filter((marcher) => {
        const kind = equipmentForSection(marcher.section);
        return kind !== null && equipmentRig(kind) !== null;
    });
}

/** Choice that gives the move to every selected marcher with equipment. */
export const SELECTION_TARGET = "selection";
const SECTION_PREFIX = "section:";
const MARCHER_PREFIX = "marcher:";

export const sectionChoice = (section: string) => `${SECTION_PREFIX}${section}`;
export const marcherChoice = (marcherId: number) =>
    `${MARCHER_PREFIX}${marcherId}`;

export function targetChoice(target: EquipmentMoveTarget): string {
    return target.kind === "section"
        ? sectionChoice(target.section)
        : marcherChoice(target.marcherId);
}

export function newDraft(target: string): EquipmentMoveDraft {
    return {
        target,
        move: "toss",
        startCount: "0",
        lengthCounts: "4",
        turns: "1",
        direction: "cw",
    };
}

export function draftFromMove(move: EquipmentMove): EquipmentMoveDraft {
    return {
        target: targetChoice(move.target),
        move: move.move,
        startCount: String(move.startCount),
        lengthCounts: String(move.lengthCounts),
        turns: String(move.turns),
        direction: move.direction,
    };
}

function targetsOf(
    choice: string,
    selectedMarcherIds: readonly number[],
): EquipmentMoveTarget[] {
    if (choice === SELECTION_TARGET)
        return selectedMarcherIds.map((marcherId) => ({
            kind: "marcher",
            marcherId,
        }));
    if (choice.startsWith(SECTION_PREFIX)) {
        const section = choice.slice(SECTION_PREFIX.length);
        return section ? [{ kind: "section", section }] : [];
    }
    if (choice.startsWith(MARCHER_PREFIX)) {
        const marcherId = Number(choice.slice(MARCHER_PREFIX.length));
        return Number.isInteger(marcherId)
            ? [{ kind: "marcher", marcherId }]
            : [];
    }
    return [];
}

const parseNumber = (text: string) =>
    text.trim() === "" ? Number.NaN : Number(text);

/**
 * The moves a draft describes (one per marcher when given to the selection),
 * or null while a field is missing or out of range.
 *
 * @param existingId - Keeps this ID on the first move when editing
 */
export function movesFromDraft(
    draft: EquipmentMoveDraft,
    {
        pageId,
        selectedMarcherIds,
        existingId,
    }: {
        pageId: number;
        selectedMarcherIds: readonly number[];
        existingId?: string;
    },
): EquipmentMove[] | null {
    const startCount = parseNumber(draft.startCount);
    const lengthCounts = parseNumber(draft.lengthCounts);
    const turns = parseNumber(draft.turns);
    if (!Number.isFinite(startCount) || startCount < 0) return null;
    if (
        !Number.isFinite(lengthCounts) ||
        lengthCounts <= 0 ||
        lengthCounts > MAX_MOVE_COUNTS
    )
        return null;
    if (!Number.isFinite(turns) || turns <= 0 || turns > MAX_MOVE_TURNS)
        return null;

    const targets = targetsOf(draft.target, selectedMarcherIds);
    if (targets.length === 0) return null;
    return targets.map((target, index) => ({
        id: index === 0 && existingId ? existingId : newEquipmentMoveId(),
        target,
        pageId,
        startCount,
        lengthCounts,
        move: draft.move,
        turns,
        direction: draft.direction,
    }));
}

/**
 * Puts `changed` where the move with `replacingId` was (later moves take
 * priority, so keeping the place matters), or at the end when adding.
 */
export function withMoves(
    moves: readonly EquipmentMove[],
    changed: readonly EquipmentMove[],
    replacingId?: string,
): EquipmentMove[] {
    const index = replacingId
        ? moves.findIndex((move) => move.id === replacingId)
        : -1;
    if (index < 0) return [...moves, ...changed];
    return [...moves.slice(0, index), ...changed, ...moves.slice(index + 1)];
}
