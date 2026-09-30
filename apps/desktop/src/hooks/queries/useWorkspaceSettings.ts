import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as z from "zod";
import { workspaceSettingsSchema } from "@/settings/workspaceSettings";
import { db } from "@/global/database/db";
import {
    getWorkspaceSettingsParsed,
    updateWorkspaceSettingsParsed,
    updateWorkspaceSettingsJSON,
    getWorkspaceSettingsJSON,
    updateWorkspaceCameraKeyframes,
    updateWorkspaceEquipmentMoves,
    WorkspaceCameraKeyframe,
    WorkspaceEquipmentMove,
} from "@/db-functions/workspaceSettings";
import { mutationOptions, QueryClient } from "@tanstack/react-query";
import { conToastError } from "@/utilities/utils";

export const workspaceSettingsKeys = {
    all: () => ["workspaceSettings"] as const,
    detail: () => [...workspaceSettingsKeys.all(), "detail"] as const,
};

// Query functions
const workspaceSettingsQueries = {
    get: async (): Promise<z.infer<typeof workspaceSettingsSchema>> => {
        return await getWorkspaceSettingsParsed({ db });
    },
    getJSON: async (): Promise<string> => {
        return await getWorkspaceSettingsJSON({ db });
    },
};

// Mutation functions
const workspaceSettingsMutations = {
    update: async (
        settings: z.infer<typeof workspaceSettingsSchema>,
    ): Promise<z.infer<typeof workspaceSettingsSchema>> => {
        return await updateWorkspaceSettingsParsed({ db, settings });
    },
    updateJSON: async (jsonData: string): Promise<string> => {
        return await updateWorkspaceSettingsJSON({ db, jsonData });
    },
};

/**
 * Query options for fetching workspace settings
 */
export const workspaceSettingsQueryOptions = (enabled = true) => ({
    queryKey: workspaceSettingsKeys.detail(),
    queryFn: async () => {
        return await workspaceSettingsQueries.get();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled,
});

/**
 * Query options for fetching workspace settings as JSON
 */
export const workspaceSettingsJSONQueryOptions = (enabled = true) => ({
    queryKey: [...workspaceSettingsKeys.detail(), "json"],
    queryFn: async () => {
        return await workspaceSettingsQueries.getJSON();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled,
});

/**
 * Mutation options for updating workspace settings
 */
export const updateWorkspaceSettingsMutationOptions = (queryClient: any) =>
    mutationOptions({
        mutationFn: async (
            settings: z.infer<typeof workspaceSettingsSchema>,
        ) => {
            return await workspaceSettingsMutations.update(settings);
        },
        onSuccess: () => {
            // Invalidate workspace settings queries to refetch the updated data
            void queryClient.invalidateQueries({
                queryKey: workspaceSettingsKeys.all(),
            });
        },
        onError: (error) => {
            conToastError("Failed to update workspace settings", error);
        },
    });

/**
 * Mutation options for updating workspace settings JSON
 */
export const updateWorkspaceSettingsJSONMutationOptions = (queryClient: any) =>
    mutationOptions({
        mutationFn: async (jsonData: string) => {
            return await workspaceSettingsMutations.updateJSON(jsonData);
        },
        onSuccess: () => {
            // Invalidate workspace settings queries to refetch the updated data
            void queryClient.invalidateQueries({
                queryKey: workspaceSettingsKeys.all(),
            });
        },
        onError: (error) => {
            conToastError("Failed to update workspace settings", error);
        },
    });

/**
 * Mutation options for replacing a list of show data kept in the workspace
 * settings. The cached settings update right away so the 3D view does not lag
 * behind, and roll back if saving fails.
 */
function showDataMutationOptions<
    K extends "cameraKeyframes" | "equipmentMoves",
    T,
>(
    queryClient: QueryClient,
    key: K,
    save: (items: T[]) => Promise<unknown>,
    errorMessage: string,
) {
    return mutationOptions({
        mutationFn: async (items: T[]) => await save(items),
        onMutate: async (items) => {
            await queryClient.cancelQueries({
                queryKey: workspaceSettingsKeys.detail(),
            });
            const previous = queryClient.getQueryData<
                z.infer<typeof workspaceSettingsSchema>
            >(workspaceSettingsKeys.detail());
            if (previous)
                queryClient.setQueryData(workspaceSettingsKeys.detail(), {
                    ...previous,
                    [key]: items,
                });
            return { previous };
        },
        onError: (error, _items, context) => {
            if (context?.previous)
                queryClient.setQueryData(
                    workspaceSettingsKeys.detail(),
                    context.previous,
                );
            conToastError(errorMessage, error);
        },
        onSettled: () => {
            void queryClient.invalidateQueries({
                queryKey: workspaceSettingsKeys.all(),
            });
        },
    });
}

/** Mutation options for replacing the 3D camera keyframes saved in the show. */
export const updateCameraKeyframesMutationOptions = (
    queryClient: QueryClient,
) =>
    showDataMutationOptions(
        queryClient,
        "cameraKeyframes",
        (keyframes: WorkspaceCameraKeyframe[]) =>
            updateWorkspaceCameraKeyframes({ db, keyframes }),
        "Failed to save camera keyframes",
    );

/** Mutation options for replacing the flag and rifle moves saved in the show. */
export const updateEquipmentMovesMutationOptions = (queryClient: QueryClient) =>
    showDataMutationOptions(
        queryClient,
        "equipmentMoves",
        (moves: WorkspaceEquipmentMove[]) =>
            updateWorkspaceEquipmentMoves({ db, moves }),
        "Failed to save equipment moves",
    );
