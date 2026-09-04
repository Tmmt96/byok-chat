import type { Conversation, Project } from '../domain/types';

export type StoredAppData = {
    initialized: boolean;
    projects: Project[];
    conversations: Conversation[];
};

const STORAGE_KEY = 'byok-chat:local-data';
let memoryData: StoredAppData = { initialized: false, projects: [], conversations: [] };

export function initializeDatabase() {
}

export function loadAppData(): StoredAppData {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);
    if (!raw) return memoryData;

    try {
        const parsed = JSON.parse(raw) as StoredAppData;
        if (!Array.isArray(parsed.projects) || !Array.isArray(parsed.conversations)) return memoryData;
        memoryData = parsed;
    } catch {
        return memoryData;
    }
    return memoryData;
}

export function saveAppData(projects: Project[], conversations: Conversation[]) {
    memoryData = { initialized: true, projects, conversations };
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryData));
}
