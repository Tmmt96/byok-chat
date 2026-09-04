let openAIKey: string | undefined;
let userName: string | undefined;
import type { CustomProviderProfile } from '../domain/types';

let customApiKey: string | undefined;
let customApiEndpoint: string | undefined;
let customApiModel: string | undefined;
let customApiName: string | undefined;
let customApiProfiles: CustomProviderProfile[] = [];
const customApiKeys = new Map<string, string>();

export const secureStore = {
    getUserName: async () => userName,
    saveUserName: async (value: string) => {
        userName = value;
    },
    saveCustomApiKey: async (value: string) => {
        customApiKey = value;
    },
    getCustomApiEndpoint: async () => customApiEndpoint,
    saveCustomApiEndpoint: async (value: string) => {
        customApiEndpoint = value;
    },
    getCustomApiModel: async () => customApiModel,
    saveCustomApiModel: async (value: string) => {
        customApiModel = value;
    },
    getCustomApiName: async () => customApiName,
    saveCustomApiName: async (value: string) => {
        customApiName = value;
    },
    getCustomApiProfiles: async () => customApiProfiles.length > 0
        ? customApiProfiles
        : customApiEndpoint && customApiModel
            ? [{ id: 'custom-legacy', name: customApiName || 'API customizada', endpoint: customApiEndpoint, model: customApiModel }]
            : [],
    getCustomApiKey: async (profileId: string) => profileId === 'custom-legacy' ? customApiKey : customApiKeys.get(profileId),
    saveCustomApiProfile: async (profile: CustomProviderProfile, key: string) => {
        customApiProfiles = [...customApiProfiles.filter((item) => item.id !== profile.id), profile];
        if (key) {
            customApiKeys.set(profile.id, key);
            if (profile.id === 'custom-legacy') customApiKey = key;
        }
    },
    deleteCustomApiProfile: async (profileId: string) => {
        customApiProfiles = customApiProfiles.filter((item) => item.id !== profileId);
        customApiKeys.delete(profileId);
    },
    getOpenAIKey: async () => openAIKey,
    saveOpenAIKey: async (value: string) => {
        openAIKey = value;
    },
};
