import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    updateEquipmentMovesMutationOptions,
    workspaceSettingsQueryOptions,
} from "@/hooks/queries/useWorkspaceSettings";
import type { EquipmentMove } from "../scene/equipmentMoves";

const NO_MOVES: EquipmentMove[] = [];

/**
 * The open show's flag and rifle moves, saved in the show file (workspace
 * settings), and a setter that saves changes.
 */
export function useEquipmentMoves(): {
    moves: EquipmentMove[];
    setMoves: (moves: EquipmentMove[]) => void;
} {
    const queryClient = useQueryClient();
    const { data: settings } = useQuery(workspaceSettingsQueryOptions());
    const { mutate } = useMutation(
        updateEquipmentMovesMutationOptions(queryClient),
    );
    const setMoves = useCallback(
        (moves: EquipmentMove[]) => mutate(moves),
        [mutate],
    );
    return { moves: settings?.equipmentMoves ?? NO_MOVES, setMoves };
}
