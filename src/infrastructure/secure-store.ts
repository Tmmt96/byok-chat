import * as SecureStore from 'expo-secure-store';
import type { CustomProviderProfile } from '../domain/types';

const OPENAI_KEY = 'secure_key_provider_openai';
const USER_NAME = 'local_user_name';
const CUSTOM_API_KEY = 'secure_key_provider_custom';
const CUSTOM_API_ENDPOINT = 'provider_custom_endpoint';
const CUSTOM_API_MODEL = 'provider_custom_model';
const CUSTOM_API_NAME = 'provider_custom_name';
const CUSTOM_API_PROFILES = 'provider_custom_profiles';

const customApiKey = (profileId: string) => `secure_key_provider_custom_${profileId}`;

async function getCustomApiProfiles(): Promise<CustomProviderProfile[]> {
    const storedProfiles = await SecureStore.getItemAsync(CUSTOM_API_PROFILES);
    if (storedProfiles) {
        try {
            return JSON.parse(storedProfiles) as CustomProviderProfile[];
        } catch {
            return [];
        }
    }

    const [endpoint, model, name] = await Promise.all([
        SecureStore.getItemAsync(CUSTOM_API_ENDPOINT),
        SecureStore.getItemAsync(CUSTOM_API_MODEL),
        SecureStore.getItemAsync(CUSTOM_API_NAME),
    ]);
    return endpoint && model ? [{ id: 'custom-legacy', name: name || 'API customizada', endpoint, model }] : [];
}

async function saveCustomApiProfiles(profiles: CustomProviderProfile[]) {
    await SecureStore.setItemAsync(CUSTOM_API_PROFILES, JSON.stringify(profiles));
}

export const secureStore = {
    getUserName: () => SecureStore.getItemAsync(USER_NAME),
    saveUserName: (value: string) => SecureStore.setItemAsync(USER_NAME, value, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
    saveCustomApiKey: (value: string) => SecureStore.setItemAsync(CUSTOM_API_KEY, value, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
    getCustomApiEndpoint: () => SecureStore.getItemAsync(CUSTOM_API_ENDPOINT),
    saveCustomApiEndpoint: (value: string) => SecureStore.setItemAsync(CUSTOM_API_ENDPOINT, value),
    getCustomApiModel: () => SecureStore.getItemAsync(CUSTOM_API_MODEL),
    saveCustomApiModel: (value: string) => SecureStore.setItemAsync(CUSTOM_API_MODEL, value),
    getCustomApiName: () => SecureStore.getItemAsync(CUSTOM_API_NAME),
    saveCustomApiName: (value: string) => SecureStore.setItemAsync(CUSTOM_API_NAME, value),
    getCustomApiProfiles,
    getCustomApiKey: async (profileId: string) => (await SecureStore.getItemAsync(customApiKey(profileId))) ?? (profileId === 'custom-legacy' ? SecureStore.getItemAsync(CUSTOM_API_KEY) : null),
    saveCustomApiProfile: async (profile: CustomProviderProfile, key: string) => {
        const profiles = (await getCustomApiProfiles()).filter((item) => item.id !== profile.id);
        await saveCustomApiProfiles([...profiles, profile]);
        if (key) {
            await SecureStore.setItemAsync(customApiKey(profile.id), key, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
            if (profile.id === 'custom-legacy') await SecureStore.setItemAsync(CUSTOM_API_KEY, key, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
        }
    },
    deleteCustomApiProfile: async (profileId: string) => {
        await saveCustomApiProfiles((await getCustomApiProfiles()).filter((item) => item.id !== profileId));
        await SecureStore.deleteItemAsync(customApiKey(profileId));
    },
    getOpenAIKey: () => SecureStore.getItemAsync(OPENAI_KEY),
    saveOpenAIKey: (value: string) => SecureStore.setItemAsync(OPENAI_KEY, value, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
    removeOpenAIKey: () => SecureStore.deleteItemAsync(OPENAI_KEY),
};
