import type Page from "@/global/classes/Page";

/**
 * Tosses, spins and sweeps that flags and rifles perform. The show data has no
 * choreography for equipment, so these are saved with the show (workspace
 * settings) and drawn by the 3D view and the 3D video export.
 */
export const EQUIPMENT_MOVE_KINDS = ["spin", "toss", "sweep"] as const;
export type EquipmentMoveKind = (typeof EQUIPMENT_MOVE_KINDS)[number];

/** Which way the equipment turns, seen from in front of the marcher */
export type SpinDirection = "cw" | "ccw";

/** Who performs a move: everyone in a section, or one marcher */
export type EquipmentMoveTarget =
    | { kind: "section"; section: string }
    | { kind: "marcher"; marcherId: number };

export interface EquipmentMove {
    /** Stable ID for lists and editing */
    id: string;
    target: EquipmentMoveTarget;
    /** The page whose counts `startCount` is measured in */
    pageId: number;
    /** Where the move starts, in counts from the start of the page (0 = first count) */
    startCount: number;
    /** How long the move lasts, in counts. It may run past the end of the page. */
    lengthCounts: number;
    move: EquipmentMoveKind;
    /**
     * Spin and toss: full turns during the move. Sweep: swings back and forth.
     * Whole numbers end where they began, so the equipment returns to its hold.
     */
    turns: number;
    direction: SpinDirection;
}

/** Longest move, in counts */
export const MAX_MOVE_COUNTS = 64;
/** Most turns (or swings) in one move */
export const MAX_MOVE_TURNS = 16;
/** Used when a page has no beats to measure counts with */
const FALLBACK_SECONDS_PER_COUNT = 0.5;

let idCounter = 0;
/** A new move ID, unique within this session. */
export function newEquipmentMoveId(): string {
    idCounter++;
    return `${Date.now().toString(36)}-m${idCounter}`;
}

type PageTiming = Pick<
    Page,
    "id" | "timestamp" | "duration" | "counts" | "beats"
>;

/**
 * Show time in milliseconds at `count` counts into a page. Follows the page's
 * own beats, so tempo changes are respected; counts past the last beat carry on
 * at that beat's length.
 */
export function pageCountToMs(page: PageTiming, count: number): number {
    const { beats } = page;
    if (beats.length === 0 || page.counts === 0) {
        const secondsPerCount =
            page.counts > 0
                ? page.duration / page.counts
                : FALLBACK_SECONDS_PER_COUNT;
        return (page.timestamp + count * secondsPerCount) * 1000;
    }
    // Counted from the page's own start, the same base as `timestamp + duration`
    // that playback and the paused view use, so moves cannot drift from them
    const whole = Math.min(Math.max(Math.floor(count), 0), beats.length);
    let seconds = page.timestamp;
    for (let i = 0; i < whole; i++) seconds += beats[i].duration;
    const beat = beats[Math.min(whole, beats.length - 1)];
    // Past the last beat, carry on at its length
    seconds += (count - whole) * beat.duration;
    return seconds * 1000;
}

/** A move placed on the show's timeline. */
export interface ResolvedEquipmentMove {
    move: EquipmentMove;
    startMs: number;
    endMs: number;
}

/**
 * Places moves on the show's timeline. Moves on pages that no longer exist, or
 * that would last no time, are left out.
 */
export function resolveEquipmentMoves(
    moves: readonly EquipmentMove[],
    pages: readonly PageTiming[],
): ResolvedEquipmentMove[] {
    const pagesById = new Map(pages.map((page) => [page.id, page]));
    return moves.flatMap((move) => {
        const page = pagesById.get(move.pageId);
        if (!page) return [];
        const startMs = pageCountToMs(page, move.startCount);
        const endMs = pageCountToMs(page, move.startCount + move.lengthCounts);
        return endMs > startMs ? [{ move, startMs, endMs }] : [];
    });
}

/** The show time a move is at `progress` (0–1) through, for previewing. */
export function timeAtMoveProgress(
    resolved: ResolvedEquipmentMove,
    progress: number,
): number {
    const clamped = Math.min(Math.max(progress, 0), 1);
    return resolved.startMs + (resolved.endMs - resolved.startMs) * clamped;
}

/** A marcher that may perform moves. */
export interface MoveCandidate {
    marcherId: number;
    section: string;
}

export function moveAppliesTo(
    move: EquipmentMove,
    marcher: MoveCandidate,
): boolean {
    return move.target.kind === "marcher"
        ? move.target.marcherId === marcher.marcherId
        : move.target.section === marcher.section;
}

export interface ActiveEquipmentMove {
    move: EquipmentMove;
    /** How far through the move, from 0 (just started) up to but not including 1 */
    progress: number;
    durationSeconds: number;
}

/**
 * The move a marcher is performing at `timeMs`, if any. A move for that one
 * marcher wins over a section move; otherwise the later one in the list wins.
 */
export function findActiveMove(
    resolved: readonly ResolvedEquipmentMove[],
    marcher: MoveCandidate,
    timeMs: number,
): ActiveEquipmentMove | null {
    let found: ResolvedEquipmentMove | null = null;
    for (const candidate of resolved) {
        if (timeMs < candidate.startMs || timeMs >= candidate.endMs) continue;
        if (!moveAppliesTo(candidate.move, marcher)) continue;
        const beatsFound =
            !found ||
            candidate.move.target.kind === "marcher" ||
            found.move.target.kind !== "marcher";
        if (beatsFound) found = candidate;
    }
    if (!found) return null;
    const lengthMs = found.endMs - found.startMs;
    return {
        move: found.move,
        progress: (timeMs - found.startMs) / lengthMs,
        durationSeconds: lengthMs / 1000,
    };
}

/** Moves in show order: by page, then by where in the page they start. */
export function sortEquipmentMoves(
    moves: readonly EquipmentMove[],
    pages: readonly Pick<Page, "id" | "order">[],
): EquipmentMove[] {
    const orderById = new Map(pages.map((page) => [page.id, page.order]));
    const orderOf = (move: EquipmentMove) =>
        orderById.get(move.pageId) ?? Number.MAX_SAFE_INTEGER;
    return [...moves].sort(
        (a, b) => orderOf(a) - orderOf(b) || a.startCount - b.startCount,
    );
}
