import { parseScene, type SceneFile } from "./sceneIO";

const KEY = "physlab.scenes.v1";

// The scenes a user saved, kept in the browser's local storage (the same browser and address only).
// Everything is optional: when storage is blocked or full the app still works, it just cannot remember.
export function loadSavedScenes(storage: Storage | undefined = safeStorage()): SceneFile[] {
    if (!storage) return [];
    try {
        const raw = JSON.parse(storage.getItem(KEY) ?? "[]");
        if (!Array.isArray(raw)) return [];
        return raw.flatMap((item) => {
            try {
                return [parseScene(item)];
            } catch {
                return []; // skip a damaged entry, keep the rest
            }
        });
    } catch {
        return [];
    }
}

// returns false when the browser refused to store the scenes
export function saveScenes(scenes: readonly SceneFile[], storage: Storage | undefined = safeStorage()): boolean {
    if (!storage) return false;
    try {
        storage.setItem(KEY, JSON.stringify(scenes));
        return true;
    } catch {
        return false;
    }
}

function safeStorage(): Storage | undefined {
    try {
        return typeof localStorage === "undefined" ? undefined : localStorage;
    } catch {
        return undefined;
    }
}
