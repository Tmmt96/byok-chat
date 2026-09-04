import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    BackHandler,
    type NativeScrollEvent,
    type NativeSyntheticEvent,
    FlatList,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
    useWindowDimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import * as Speech from 'expo-speech';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import Svg, { Circle } from 'react-native-svg';
import {
    ArrowDown,
    ArrowUp,
    Check,
    ChevronDown,
    ChevronLeft,
    Copy,
    FolderMinus,
    FolderKanban,
    FolderPlus,
    KeyRound,
    Mic,
    MoreHorizontal,
    Palette,
    Pencil,
    Plus,
    Settings2,
    ShieldCheck,
    Sparkles,
    Square,
    Trash2,
    Volume2,
    X,
} from 'lucide-react-native';
import { assembleProjectContext } from './src/domain/project-context';
import { createConversationTitle } from './src/domain/conversation-title';
import type { Conversation, CustomProviderProfile, Message, Project, ResponseMode } from './src/domain/types';
import { seedConversations, seedProjects } from './src/data/seed';
import { initializeDatabase, loadAppData, saveAppData } from './src/infrastructure/database';
import { secureStore } from './src/infrastructure/secure-store';
import { streamProvider } from './src/providers';
import { testCustomApiConnection } from './src/providers/custom-api';
import { availableModels, initialModel, maxResponseTokens, type ModelDefinition } from './src/features/models';
import { stripMarkdownForSpeech } from './src/features/markdown';
import { speakResponse } from './src/features/voice';
import { downloadPiperVoice, getPiperVoiceStatus, speakPiperResponse, stopPiper, type PiperVoiceStatus } from './src/features/piper';
import { colors, palette } from './src/theme';
import { styles } from './src/theme.styles';

type Tab = 'home' | 'chat' | 'settings';

const id = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function isHttpUrl(value: string) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
        return false;
    }
}

function useKeyboardHeight() {
    const [keyboardHeight, setKeyboardHeight] = useState(0);

    useEffect(() => {
        const showSubscription = Keyboard.addListener('keyboardDidShow', (event) => setKeyboardHeight(event.endCoordinates.height));
        const hideSubscription = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
        return () => {
            showSubscription.remove();
            hideSubscription.remove();
        };
    }, []);

    return keyboardHeight;
}

export default function App() {
    const [tab, setTab] = useState<Tab>('home');
    const [projects, setProjects] = useState<Project[]>(seedProjects);
    const [conversations, setConversations] = useState<Conversation[]>(seedConversations);
    const [activeConversationId, setActiveConversationId] = useState('launch-plan');
    const [activeProjectId, setActiveProjectId] = useState<string | undefined>('launch');
    const [selectedModel, setSelectedModel] = useState(initialModel);
    const [draft, setDraft] = useState('');
    const [responseMode, setResponseMode] = useState<ResponseMode>('text');
    const [editingMessageId, setEditingMessageId] = useState<string | undefined>(undefined);
    const [isStreaming, setIsStreaming] = useState(false);
    const streamAbortController = useRef<AbortController | null>(null);
    const [modelSheetOpen, setModelSheetOpen] = useState(false);
    const [voiceSheetOpen, setVoiceSheetOpen] = useState(false);
    const [chatOptionsOpen, setChatOptionsOpen] = useState(false);
    const [projectDetailsId, setProjectDetailsId] = useState<string>();
    const [projectSheetConversationId, setProjectSheetConversationId] = useState<string>();
    const [pendingProjectConversationId, setPendingProjectConversationId] = useState<string>();
    const [newProjectSheetOpen, setNewProjectSheetOpen] = useState(false);
    const [newProjectName, setNewProjectName] = useState('');
    const [availableVoices, setAvailableVoices] = useState<Speech.Voice[]>([]);
    const [selectedVoice, setSelectedVoice] = useState<string | undefined>();
    const [voiceEngine, setVoiceEngine] = useState<'system' | 'piper'>('system');
    const [piperStatus, setPiperStatus] = useState<PiperVoiceStatus>('unavailable');
    const [piperProgress, setPiperProgress] = useState(0);
    const [piperError, setPiperError] = useState<string>();
    const [speakingMessageId, setSpeakingMessageId] = useState<string>();
    const speakingRequestId = useRef(0);
    const [apiKey, setApiKey] = useState('');
    const [keyConfigured, setKeyConfigured] = useState(false);
    const [openAIKeySheetOpen, setOpenAIKeySheetOpen] = useState(false);
    const [customApiProfiles, setCustomApiProfiles] = useState<CustomProviderProfile[]>([]);
    const [customApiSheetOpen, setCustomApiSheetOpen] = useState(false);
    const [editingCustomApiId, setEditingCustomApiId] = useState<string>();
    const [userName, setUserName] = useState('');
    const [nameDraft, setNameDraft] = useState('');
    const [profileSheetOpen, setProfileSheetOpen] = useState(false);
    const [paletteId, setPaletteId] = useState('terra');
    const [storageReady, setStorageReady] = useState(false);

    const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId);
    const activeProject = projects.find((project) => project.id === activeProjectId);
    const models: ModelDefinition[] = [
        ...availableModels.filter((model) => model.providerId === 'openai'),
        ...customApiProfiles.map((profile) => ({ id: profile.id, name: profile.name, provider: 'API customizada', providerId: 'custom' as const, contextWindow: 128_000 })),
    ];

    useEffect(() => {
        initializeDatabase();
        const storedData = loadAppData();
        if (storedData.initialized) {
            setProjects(storedData.projects);
            setConversations(storedData.conversations);
            const firstConversation = storedData.conversations[0];
            setActiveConversationId(firstConversation?.id ?? '');
            setActiveProjectId(firstConversation?.projectId);
        } else {
            saveAppData(seedProjects, seedConversations);
        }
        setStorageReady(true);
        void secureStore.getUserName().then((value) => {
            setUserName(value ?? '');
            setNameDraft(value ?? '');
            if (!value) setProfileSheetOpen(true);
        });
        void secureStore.getOpenAIKey().then((value) => setKeyConfigured(Boolean(value)));
        void secureStore.getCustomApiProfiles().then(setCustomApiProfiles);
        void Speech.getAvailableVoicesAsync().then((voices) => {
            const portuguese = voices.filter((voice) => voice.language.toLowerCase().replace('_', '-') === 'pt-pt');
            setAvailableVoices(portuguese);
            setSelectedVoice(portuguese[0]?.identifier);
        });
        void getPiperVoiceStatus().then((status) => {
            setPiperStatus(status);
            if (status === 'ready') setVoiceEngine('piper');
        }).catch((error: Error) => setPiperError(error.message));
    }, []);

    useEffect(() => {
        if (!storageReady) return;
        saveAppData(projects, conversations);
    }, [conversations, projects, storageReady]);

    useEffect(() => {
        if (Platform.OS !== 'android') return undefined;

        const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
            // Mantém o comportamento nativo para modais
            if (modelSheetOpen || voiceSheetOpen || chatOptionsOpen || projectSheetConversationId || newProjectSheetOpen || projectDetailsId) return false;

            if (tab === 'chat' || tab === 'settings') {
                setTab('home');
                return true;
            }

            return false;
        });

        return () => subscription.remove();
    }, [chatOptionsOpen, modelSheetOpen, newProjectSheetOpen, projectDetailsId, projectSheetConversationId, tab, voiceSheetOpen]);

    useSpeechRecognitionEvent('result', (event) => {
        const transcript = event.results?.[0]?.transcript;
        if (transcript) setDraft(transcript);
    });

    const openConversation = (conversation: Conversation) => {
        setActiveConversationId(conversation.id);
        setActiveProjectId(conversation.projectId);
        setSelectedModel(models.find((model) => model.id === conversation.modelId) ?? initialModel);
        setEditingMessageId(undefined);
        setTab('chat');
    };

    const createConversation = (projectId?: string) => {
        const conversation: Conversation = {
            id: id('conversation'),
            projectId,
            title: 'Nova conversa',
            modelId: selectedModel.id,
            updatedAt: Date.now(),
            messages: [],
        };
        setConversations((current) => [conversation, ...current]);
        setActiveConversationId(conversation.id);
        setActiveProjectId(projectId);
        setEditingMessageId(undefined);
        setTab('chat');
    };

    const editMessage = (message: Message) => {
        if (isStreaming) return;
        if (message.role !== 'user') return;
        setDraft(message.content);
        setEditingMessageId(message.id);
        setTab('chat');
    };

    const copyResponse = (content: string) => Clipboard.setStringAsync(content);

    const addConversationToProject = (projectId: string) => {
        if (!projectSheetConversationId) return;
        setConversations((current) => current.map((conversation) => conversation.id === projectSheetConversationId
            ? { ...conversation, projectId, updatedAt: Date.now() }
            : conversation));
        if (projectSheetConversationId === activeConversationId) setActiveProjectId(projectId);
        setProjectSheetConversationId(undefined);
    };

    const removeConversationFromProject = (conversationId: string) => {
        setConversations((current) => current.map((conversation) => conversation.id === conversationId
            ? { ...conversation, projectId: undefined, updatedAt: Date.now() }
            : conversation));
        if (conversationId === activeConversationId) setActiveProjectId(undefined);
    };

    const deleteProject = (project: Project) => {
        Alert.alert('Apagar projeto?', `"${project.name}" será apagado. As conversas ficam sem projeto.`, [
            { text: 'Cancelar', style: 'cancel' },
            {
                text: 'Apagar',
                style: 'destructive',
                onPress: () => {
                    setProjects((current) => current.filter((item) => item.id !== project.id));
                    setConversations((current) => current.map((conversation) => conversation.projectId === project.id
                        ? { ...conversation, projectId: undefined, updatedAt: Date.now() }
                        : conversation));
                    if (activeProjectId === project.id) setActiveProjectId(undefined);
                    setProjectDetailsId(undefined);
                },
            },
        ]);
    };

    const deleteConversation = (conversationId: string) => {
        const conversation = conversations.find((item) => item.id === conversationId);
        if (!conversation) return;
        Alert.alert('Apagar conversa?', `"${conversation.title}" será removida deste dispositivo.`, [
            { text: 'Cancelar', style: 'cancel' },
            {
                text: 'Apagar',
                style: 'destructive',
                onPress: () => {
                    setConversations((current) => current.filter((item) => item.id !== conversationId));
                    if (activeConversationId === conversationId) {
                        setChatOptionsOpen(false);
                        setTab('home');
                    }
                },
            },
        ]);
    };

    const createProject = () => {
        const name = newProjectName.trim();
        if (!name) return;
        const project: Project = { id: id('project'), name, description: 'Novo espaço de trabalho', colorToken: 'terra', updatedAt: Date.now() };
        setProjects((current) => [project, ...current]);
        if (pendingProjectConversationId) {
            setConversations((current) => current.map((conversation) => conversation.id === pendingProjectConversationId
                ? { ...conversation, projectId: project.id, updatedAt: Date.now() }
                : conversation));
            setPendingProjectConversationId(undefined);
        }
        setNewProjectName('');
        setNewProjectSheetOpen(false);
    };

    const selectModel = (modelId: string) => {
        const model = models.find((candidate) => candidate.id === modelId);
        if (!model) return;
        setSelectedModel(model);
        setConversations((current) => current.map((conversation) => conversation.id === activeConversationId
            ? { ...conversation, modelId: model.id, updatedAt: Date.now() }
            : conversation));
        setModelSheetOpen(false);
    };

    const sendMessage = async () => {
        const content = draft.trim();
        if (!content || !activeConversation || isStreaming) return;

        Keyboard.dismiss();

        const userMessage: Message = { id: id('user'), role: 'user', content, createdAt: Date.now(), status: 'completed' };
        const assistantId = id('assistant');
        const assistantMessage: Message = { id: assistantId, role: 'assistant', content: '', createdAt: Date.now() + 1, status: 'streaming' };
        const editedMessageIndex = editingMessageId ? activeConversation.messages.findIndex((message) => message.id === editingMessageId) : -1;
        const conversationMessages = editedMessageIndex >= 0 ? activeConversation.messages.slice(0, editedMessageIndex) : activeConversation.messages;
        const shouldSetTitle = editedMessageIndex === 0 || !activeConversation.messages.some((message) => message.role === 'user');
        const conversationTitle = shouldSetTitle ? createConversationTitle(content) : activeConversation.title;
        const contextConversations = editedMessageIndex >= 0
            ? conversations.map((conversation) => conversation.id === activeConversation.id ? { ...conversation, messages: conversationMessages } : conversation)
            : conversations;
        const context = activeProject
            ? assembleProjectContext(activeProject, contextConversations, [userMessage])
            : {
                input: [...conversationMessages.map(({ role, content: messageContent }) => ({ role, content: messageContent })), { role: 'user' as const, content }],
            };

        setConversations((current) => current.map((conversation) => conversation.id === activeConversation.id
            ? { ...conversation, title: conversationTitle, updatedAt: Date.now(), messages: [...conversationMessages, userMessage, assistantMessage] }
            : conversation));
        setDraft('');
        setEditingMessageId(undefined);
        setIsStreaming(true);
        const abortController = new AbortController();
        streamAbortController.current = abortController;

        try {
            const model = models.find((candidate) => candidate.id === activeConversation.modelId) ?? initialModel;
            await streamProvider(model.providerId, { model: activeConversation.modelId, providerConfigId: model.providerId === 'custom' ? model.id : undefined, input: context.input, maxOutputTokens: maxResponseTokens, signal: abortController.signal }, (event) => {
                if (event.type === 'text_delta') {
                    setConversations((current) => current.map((conversation) => conversation.id === activeConversation.id
                        ? { ...conversation, messages: conversation.messages.map((message) => message.id === assistantId ? { ...message, content: message.content + event.text } : message) }
                        : conversation));
                }
                if (event.type === 'error') {
                    if (abortController.signal.aborted) {
                        setIsStreaming(false);
                        return;
                    }
                    setConversations((current) => current.map((conversation) => conversation.id === activeConversation.id
                        ? { ...conversation, messages: conversation.messages.map((message) => message.id === assistantId ? { ...message, content: event.error.message, status: 'failed' } : message) }
                        : conversation));
                }
                if (event.type === 'done' || event.type === 'error') setIsStreaming(false);
            });
        } finally {
            if (streamAbortController.current === abortController) streamAbortController.current = null;
            setIsStreaming(false);
        }
    };

    const stopStreaming = () => {
        const abortController = streamAbortController.current;
        if (!abortController) return;
        abortController.abort();
        streamAbortController.current = null;
        setConversations((current) => current.map((conversation) => conversation.id === activeConversationId
            ? { ...conversation, messages: conversation.messages.map((message) => message.status === 'streaming' ? { ...message, status: 'completed' } : message) }
            : conversation));
        setIsStreaming(false);
    };

    const startDictation = async () => {
        const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (!permission.granted) return;
        ExpoSpeechRecognitionModule.start({ lang: 'pt-PT', interimResults: true, continuous: false });
    };

    const stopSpeaking = () => {
        speakingRequestId.current += 1;
        Speech.stop();
        stopPiper();
        setSpeakingMessageId(undefined);
    };

    const speakMessage = (message: Message) => {
        const speechText = stripMarkdownForSpeech(message.content);
        if (!speechText) return;
        const requestId = ++speakingRequestId.current;
        Speech.stop();
        stopPiper();
        setSpeakingMessageId(message.id);
        const finishSpeaking = () => {
            if (speakingRequestId.current === requestId) setSpeakingMessageId(undefined);
        };
        if (voiceEngine === 'piper') {
            void speakPiperResponse(speechText, { onDone: finishSpeaking, onStopped: finishSpeaking, onError: finishSpeaking }).catch(finishSpeaking);
            return;
        }
        speakResponse(speechText, selectedVoice, { onDone: finishSpeaking, onStopped: finishSpeaking, onError: finishSpeaking });
    };

    const handleDownloadPiper = async () => {
        if (piperStatus === 'downloading') return;
        setPiperStatus('downloading');
        setPiperProgress(0);
        setPiperError(undefined);
        try {
            await downloadPiperVoice(setPiperProgress);
            setPiperStatus('ready');
            setVoiceEngine('piper');
        } catch (error) {
            setPiperStatus('not-downloaded');
            setPiperError(error instanceof Error ? error.message : String(error));
        }
    };

    const selectPiper = () => {
        if (piperStatus === 'ready') {
            setVoiceEngine('piper');
            return;
        }
        void handleDownloadPiper();
    };

    useEffect(() => {
        if (tab !== 'chat') {
            stopSpeaking();
            stopStreaming();
        }
    }, [tab]);

    useEffect(() => () => {
        stopSpeaking();
        streamAbortController.current?.abort();
    }, []);

    const saveKey = async () => {
        if (!apiKey.trim()) return;
        await secureStore.saveOpenAIKey(apiKey.trim());
        setApiKey('');
        setKeyConfigured(true);
        setOpenAIKeySheetOpen(false);
    };

    const openOpenAIKeySheet = () => {
        setApiKey('');
        setOpenAIKeySheetOpen(true);
    };

    const deleteOpenAIKey = () => {
        Alert.alert('Apagar key OpenAI?', 'A key será removida deste dispositivo.', [
            { text: 'Cancelar', style: 'cancel' },
            {
                text: 'Apagar',
                style: 'destructive',
                onPress: async () => {
                    await secureStore.removeOpenAIKey();
                    setApiKey('');
                    setKeyConfigured(false);
                    setOpenAIKeySheetOpen(false);
                },
            },
        ]);
    };

    const persistUserName = async (value: string) => {
        Keyboard.dismiss();
        await secureStore.saveUserName(value);
        setUserName(value);
        setNameDraft(value);
        setProfileSheetOpen(false);
    };

    const saveUserName = async () => {
        const value = nameDraft.trim();
        if (!value) return;
        if (userName && value !== userName) {
            Keyboard.dismiss();
            Alert.alert('Alterar nome?', `Queres mesmo alterar o nome para "${value}"?`, [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Alterar', onPress: () => void persistUserName(value) },
            ]);
            return;
        }
        await persistUserName(value);
    };

    const testAndSaveCustomApi = async ({ id: profileId, name, endpoint, model, key }: CustomApiConfiguration) => {
        const profile: CustomProviderProfile = { id: profileId || id('provider'), name: name.trim(), endpoint: endpoint.trim(), model: model.trim() };
        const normalizedKey = key.trim() || await secureStore.getCustomApiKey(profile.id) || '';
        if (!profile.name || !isHttpUrl(profile.endpoint) || !profile.model || !normalizedKey) return { ok: false as const, message: 'Preencha nome, endpoint, modelo e API key.' };
        const result = await testCustomApiConnection(profile, normalizedKey);
        if (!result.ok) return result;
        await secureStore.saveCustomApiProfile(profile, normalizedKey);
        setCustomApiProfiles((current) => [...current.filter((item) => item.id !== profile.id), profile]);
        setCustomApiSheetOpen(false);
        return { ok: true as const };
    };

    const deleteCustomApi = (profile: CustomProviderProfile) => {
        Alert.alert('Apagar provider?', `"${profile.name}" será removido deste dispositivo.`, [
            { text: 'Cancelar', style: 'cancel' },
            {
                text: 'Apagar',
                style: 'destructive',
                onPress: async () => {
                    await secureStore.deleteCustomApiProfile(profile.id);
                    setCustomApiProfiles((current) => current.filter((item) => item.id !== profile.id));
                    if (selectedModel.id === profile.id) setSelectedModel(initialModel);
                },
            },
        ]);
    };

    return (
        <SafeAreaProvider>
            <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
                <StatusBar style="dark" />
                {tab === 'home' && (
                    <HomeScreen
                        projects={projects}
                        conversations={conversations}
                        userName={userName}
                        selectedModel={selectedModel}
                        onProjectPress={(project) => setProjectDetailsId(project.id)}
                        onConversationPress={openConversation}
                        onAddToProject={(conversation) => setProjectSheetConversationId(conversation.id)}
                        onDeleteConversation={(conversation) => deleteConversation(conversation.id)}
                        onNewProject={() => setNewProjectSheetOpen(true)}
                        onNewConversation={() => createConversation()}
                        onSettings={() => setTab('settings')}
                    />
                )}
                {tab === 'chat' && activeConversation && (
                    <ChatScreen
                        conversation={activeConversation}
                        project={activeProject}
                        models={models}
                        draft={draft}
                        responseMode={responseMode}
                        isStreaming={isStreaming}
                        editingMessageId={editingMessageId}
                        onBack={() => { stopSpeaking(); stopStreaming(); setTab('home'); }}
                        onDraftChange={setDraft}
                        onModeChange={setResponseMode}
                        onMorePress={() => setChatOptionsOpen(true)}
                        onModelPress={() => setModelSheetOpen(true)}
                        onMicPress={startDictation}
                        onSend={sendMessage}
                        onStop={stopStreaming}
                        onSpeak={speakMessage}
                        onStopSpeaking={stopSpeaking}
                        speakingMessageId={speakingMessageId}
                        onEditMessage={editMessage}
                        onCopyResponse={copyResponse}
                    />
                )}
                {tab === 'settings' && (
                    <KeyboardAvoidingView style={styles.screenKeyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
                        <SettingsScreen
                            keyConfigured={keyConfigured}
                            onOpenOpenAIKey={openOpenAIKeySheet}
                            onDeleteOpenAIKey={deleteOpenAIKey}
                            customApiProfiles={customApiProfiles}
                            onNewCustomApi={() => { setEditingCustomApiId(undefined); setCustomApiSheetOpen(true); }}
                            onEditCustomApi={(profile) => { setEditingCustomApiId(profile.id); setCustomApiSheetOpen(true); }}
                            onDeleteCustomApi={deleteCustomApi}
                            userName={userName}
                            nameDraft={nameDraft}
                            onNameChange={setNameDraft}
                            onSaveName={saveUserName}
                            voices={availableVoices}
                            selectedVoice={selectedVoice}
                            onVoicePress={() => setVoiceSheetOpen(true)}
                            voiceEngine={voiceEngine}
                            piperStatus={piperStatus}
                            piperProgress={piperProgress}
                            piperError={piperError}
                            onPiperPress={selectPiper}
                            onPreviewVoice={() => {
                                if (voiceEngine === 'piper') void speakPiperResponse('Esta é a voz Piper escolhida para as respostas.');
                                else Speech.speak('Esta é a voz escolhida para as respostas.', { voice: selectedVoice, language: 'pt-PT' });
                            }}
                            paletteId={paletteId}
                            onPaletteChange={setPaletteId}
                            onBack={() => setTab('home')}
                        />
                    </KeyboardAvoidingView>
                )}
                {tab !== 'chat' && <BottomTabs active={tab} onChange={setTab} onNewConversation={() => createConversation()} />}
                <ProfileSheet visible={profileSheetOpen} name={nameDraft} onNameChange={setNameDraft} onSave={saveUserName} onClose={() => setProfileSheetOpen(false)} />
                <OpenAIKeySheet visible={openAIKeySheetOpen} configured={keyConfigured} apiKey={apiKey} onApiKeyChange={setApiKey} onSave={saveKey} onClose={() => setOpenAIKeySheetOpen(false)} />
                <CustomApiSheet visible={customApiSheetOpen} profile={customApiProfiles.find((item) => item.id === editingCustomApiId)} onClose={() => setCustomApiSheetOpen(false)} onSave={testAndSaveCustomApi} />
                <ModelSheet models={models} visible={modelSheetOpen} selectedModelId={selectedModel.id} onSelect={selectModel} onClose={() => setModelSheetOpen(false)} />
                <ChatOptionsSheet
                    visible={chatOptionsOpen}
                    onClose={() => setChatOptionsOpen(false)}
                    onNewConversation={() => { setChatOptionsOpen(false); createConversation(activeProjectId); }}
                    onAddToProject={() => {
                        if (activeConversation) {
                            setChatOptionsOpen(false);
                            setProjectSheetConversationId(activeConversation.id);
                        }
                    }}
                    onDelete={() => activeConversation && deleteConversation(activeConversation.id)}
                />
                <VoiceSheet visible={voiceSheetOpen} voices={availableVoices} selectedVoice={selectedVoice} onSelect={(voice) => { setSelectedVoice(voice); setVoiceEngine('system'); setVoiceSheetOpen(false); }} onClose={() => setVoiceSheetOpen(false)} />
                <ProjectSheet
                    visible={Boolean(projectSheetConversationId)}
                    projects={projects}
                    onSelect={addConversationToProject}
                    onClose={() => setProjectSheetConversationId(undefined)}
                    onCreate={() => {
                        if (projectSheetConversationId) setPendingProjectConversationId(projectSheetConversationId);
                        setProjectSheetConversationId(undefined);
                        setNewProjectSheetOpen(true);
                    }}
                />
                <ProjectDetailsSheet
                    project={projects.find((project) => project.id === projectDetailsId)}
                    conversations={conversations}
                    onClose={() => setProjectDetailsId(undefined)}
                    onConversationPress={(conversation) => { setProjectDetailsId(undefined); openConversation(conversation); }}
                    onNewConversation={(project) => { setProjectDetailsId(undefined); createConversation(project.id); }}
                    onRemoveConversation={removeConversationFromProject}
                    onDeleteProject={deleteProject}
                />
                <NewProjectSheet visible={newProjectSheetOpen} name={newProjectName} onNameChange={setNewProjectName} onCreate={createProject} onClose={() => setNewProjectSheetOpen(false)} />
            </SafeAreaView>
        </SafeAreaProvider>
    );
}

function HomeScreen({ projects, conversations, userName, selectedModel, onProjectPress, onConversationPress, onAddToProject, onDeleteConversation, onNewProject, onNewConversation, onSettings }: {
    projects: Project[];
    conversations: Conversation[];
    userName: string;
    selectedModel: typeof initialModel;
    onProjectPress: (project: Project) => void;
    onConversationPress: (conversation: Conversation) => void;
    onAddToProject: (conversation: Conversation) => void;
    onDeleteConversation: (conversation: Conversation) => void;
    onNewProject: () => void;
    onNewConversation: () => void;
    onSettings: () => void;
}) {
    return (
        <ScrollView contentContainerStyle={styles.homeContent} showsVerticalScrollIndicator={false}>
            <View style={styles.topBar}><View style={styles.brand}><View style={styles.brandMark}><Sparkles size={15} color={colors.surface} /></View><Text style={styles.brandText}>BYOK / CHAT</Text></View><Pressable onPress={onSettings} style={styles.iconButton} accessibilityLabel="Abrir definições"><Settings2 size={19} color={colors.deep} /></Pressable></View>
            <View style={styles.greetingRow}><View><Text style={styles.overline}>A TUA ÁREA</Text><Text style={styles.heroTitle}>{userName ? `Olá, ${userName}` : 'Olá'}</Text></View><View style={styles.avatar}><Text style={styles.avatarText}>{userName ? userName.slice(0, 2).toUpperCase() : '?'}</Text></View></View>
            <View style={styles.providerPill}><View style={styles.providerMark}><Text style={styles.providerMarkText}>O</Text></View><View><Text style={styles.providerName}>{selectedModel.provider}</Text><Text style={styles.providerModel}>{selectedModel.name}</Text></View><View style={styles.liveDot} /></View>
            <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>PROJETOS</Text><Pressable onPress={onNewProject} accessibilityLabel="Novo projeto" style={styles.sectionActionButton}><FolderPlus size={14} color={colors.terracotta} /><Text style={styles.sectionAction}>Novo projeto</Text></Pressable></View>
            {projects.map((project) => <Pressable key={project.id} onPress={() => onProjectPress(project)} style={styles.projectRow}><View style={styles.projectIcon}><FolderKanban size={17} color={colors.deep} /></View><View style={styles.rowCopy}><Text style={styles.rowTitle}>{project.name}</Text><Text style={styles.rowSub}>{project.description}</Text></View><View style={styles.rowMeta}><Text style={styles.rowCount}>{conversations.filter((conversation) => conversation.projectId === project.id).length} conversas</Text><Text style={styles.rowTime}>agora  ›</Text></View></Pressable>)}
            <View style={[styles.contextChip, { marginTop: 8 }]}><ShieldCheck size={13} color={colors.deep} /><Text style={styles.contextChipText}>Contexto partilhado · todas as conversas</Text></View>
            <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>CONVERSAS RECENTES</Text><Text style={styles.sectionAction}>Sem projeto</Text></View>
            {conversations.filter((conversation) => !conversation.projectId).map((conversation) => <ConversationRow key={conversation.id} conversation={conversation} onPress={() => onConversationPress(conversation)} onAddToProject={() => onAddToProject(conversation)} onDelete={() => onDeleteConversation(conversation)} />)}
            <Pressable onPress={onNewConversation} accessibilityLabel="Nova conversa" style={styles.newButton}><Plus size={16} color={colors.terracotta} /><Text style={styles.newButtonText}>Nova conversa</Text></Pressable>
        </ScrollView>
    );
}

function ConversationRow({ conversation, onPress, onAddToProject, onDelete }: { conversation: Conversation; onPress: () => void; onAddToProject: () => void; onDelete: () => void }) {
    return <View style={styles.conversationRow}><Pressable onPress={onPress} style={styles.conversationMain}><View style={styles.conversationIcon}><Sparkles size={14} color={colors.deep} /></View><View style={styles.rowCopy}><Text style={styles.rowTitle}>{conversation.title}</Text><Text style={styles.rowSub}>{conversation.messages[0]?.content ?? 'Sem mensagens ainda'}</Text></View></Pressable><Pressable onPress={onAddToProject} style={styles.rowAction} accessibilityLabel="Adicionar conversa ao projeto"><FolderPlus size={17} color={colors.terracotta} /></Pressable><Pressable onPress={onDelete} style={styles.rowAction} accessibilityLabel="Apagar conversa"><Trash2 size={17} color={colors.muted} /></Pressable><Text style={styles.rowTime}>ontem</Text></View>;
}

function ChatScreenLegacy({ conversation, project, draft, responseMode, isStreaming, onBack, onDraftChange, onModeChange, onMorePress, onModelPress, onMicPress, onSend, onSpeak }: {
    conversation: Conversation;
    project?: Project;
    draft: string;
    responseMode: ResponseMode;
    isStreaming: boolean;
    onBack: () => void;
    onDraftChange: (value: string) => void;
    onModeChange: (mode: ResponseMode) => void;
    onMorePress: () => void;
    onModelPress: () => void;
    onMicPress: () => void;
    onSend: () => void;
    onSpeak: (message: Message) => void;
}) {
    const model = availableModels.find((candidate) => candidate.id === conversation.modelId);
    const keyboardOpen = useKeyboardHeight() > 0;
    return <KeyboardAvoidingView style={styles.chatLayout} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}><View style={styles.chatHeader}><Pressable onPress={onBack} style={styles.headerButton} accessibilityLabel="Voltar"><ChevronLeft size={22} color={colors.deep} /></Pressable><View style={styles.chatTitleWrap}><Text style={styles.chatTitle}>{project?.name ?? conversation.title}</Text><Text style={styles.chatSubtitle}>{project ? 'Nova conversa · projeto' : 'OpenAI · GPT-5.6 Luna'}</Text></View><View style={styles.modeSwitch}><Pressable onPress={() => onModeChange('text')} accessibilityLabel="Modo texto" style={[styles.modeItem, responseMode === 'text' && styles.modeActive]}><Text style={[styles.modeText, responseMode === 'text' && styles.modeTextActive]}>Texto</Text></Pressable><Pressable onPress={() => onModeChange('voice')} accessibilityLabel="Modo voz" style={[styles.modeItem, responseMode === 'voice' && styles.modeActive]}><Text style={[styles.modeText, responseMode === 'voice' && styles.modeTextActive]}>Voz</Text></Pressable></View><Pressable onPress={onMorePress} style={styles.headerButton} accessibilityLabel="Mais opções"><MoreHorizontal size={20} color={colors.muted} /></Pressable></View>{project && <View style={styles.projectContext}><View><Text style={styles.projectContextTitle}>Contexto do projeto</Text><Text style={styles.projectContextSub}>Todas as conversas · {project ? 'incluídas' : ''}</Text></View><Text style={styles.infoIcon}>i</Text></View>}<FlatList data={conversation.messages} keyExtractor={(message) => message.id} contentContainerStyle={styles.messages} renderItem={({ item }) => <MessageBubble message={item} onSpeak={item.role === 'assistant' ? onSpeak : undefined} />} ListEmptyComponent={<View style={styles.emptyChat}><Sparkles size={22} color={colors.terracotta} /><Text style={styles.emptyChatTitle}>Começa pelo que tens em mente.</Text><Text style={styles.emptyChatText}>Esta conversa pode usar o contexto completo do projeto.</Text></View>} /><View style={[styles.composer, keyboardOpen && styles.composerKeyboardOpen]}><Pressable onPress={onModelPress} accessibilityLabel="Escolher modelo" style={styles.modelSelect}><View style={styles.modelDot} /><Text style={styles.modelText}>{model?.name ?? conversation.modelId}</Text><ChevronDown size={14} color={colors.terracotta} /></Pressable><TextInput value={draft} onChangeText={onDraftChange} placeholder="Escreve uma mensagem..." placeholderTextColor={colors.muted} multiline style={styles.composerInput} accessibilityLabel="Prompt" /><View style={styles.composerActions}><Pressable onPress={onMicPress} style={styles.micButton} accessibilityLabel="Ditar prompt"><Mic size={19} color={colors.deep} /></Pressable><Pressable onPress={onSend} disabled={isStreaming || !draft.trim()} style={[styles.sendButton, (!draft.trim() || isStreaming) && styles.sendDisabled]} accessibilityLabel="Enviar prompt"><ArrowUp size={19} color={colors.surface} /></Pressable></View></View><Text style={styles.directNote}>{responseMode === 'voice' ? 'Resposta por voz · texto mantido' : 'Resposta por texto · mudar para Voz'}</Text></KeyboardAvoidingView>;
}

function ChatScreen({ conversation, project, models, draft, responseMode, isStreaming, editingMessageId, onBack, onDraftChange, onModeChange, onMorePress, onModelPress, onMicPress, onSend, onStop, onSpeak, onStopSpeaking, speakingMessageId, onEditMessage, onCopyResponse }: {
    conversation: Conversation;
    project?: Project;
    models: ModelDefinition[];
    draft: string;
    responseMode: ResponseMode;
    isStreaming: boolean;
    editingMessageId?: string;
    onBack: () => void;
    onDraftChange: (value: string) => void;
    onModeChange: (mode: ResponseMode) => void;
    onMorePress: () => void;
    onModelPress: () => void;
    onMicPress: () => void;
    onSend: () => void;
    onStop: () => void;
    onSpeak: (message: Message) => void;
    onStopSpeaking: () => void;
    speakingMessageId?: string;
    onEditMessage?: (message: Message) => void;
    onCopyResponse?: (content: string) => void;
}) {
    const model = models.find((candidate) => candidate.id === conversation.modelId);
    const listRef = useRef<FlatList<Message>>(null);
    const composerRef = useRef<TextInput>(null);
    const positionedResponseId = useRef<string | undefined>(undefined);
    const listScrollOffset = useRef(0);
    const [composerHeight, setComposerHeight] = useState(0);
    const [showScrollToEnd, setShowScrollToEnd] = useState(false);
    const [listContentHeight, setListContentHeight] = useState(0);
    const [listViewportHeight, setListViewportHeight] = useState(0);
    const keyboardHeight = useKeyboardHeight();
    const { height: windowHeight } = useWindowDimensions();
    const keyboardGap = windowHeight * 0.018;
    const restingBottom = windowHeight * 0.035;
    const directNoteGap = windowHeight * 0.024;
    const composerBottom = keyboardHeight > 0 ? keyboardHeight + keyboardGap : restingBottom;
    const scrollButtonBottom = composerBottom + composerHeight + keyboardGap;
    const maxScrollOffset = Math.max(0, listContentHeight - listViewportHeight);

    useEffect(() => {
        if (editingMessageId) requestAnimationFrame(() => composerRef.current?.focus());
    }, [editingMessageId]);

    const handleScroll = ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
        listScrollOffset.current = nativeEvent.contentOffset.y;
        const distanceFromEnd = nativeEvent.contentSize.height - nativeEvent.layoutMeasurement.height - nativeEvent.contentOffset.y;
        const nearEnd = distanceFromEnd <= windowHeight * 0.06;
        setShowScrollToEnd(!nearEnd && nativeEvent.contentSize.height > nativeEvent.layoutMeasurement.height);
    };
    const scrollToEnd = () => {
        setShowScrollToEnd(false);
        requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: maxScrollOffset, animated: true }));
    };

    return (
        <View style={styles.chatLayout}>
            <View style={styles.chatHeader}>
                <Pressable onPress={onBack} style={styles.headerButton} accessibilityLabel="Voltar"><ChevronLeft size={22} color={colors.deep} /></Pressable>
                <View style={styles.chatTitleWrap}><Text style={styles.chatTitle}>{project?.name ?? conversation.title}</Text><Text style={styles.chatSubtitle}>{project ? 'Nova conversa · projeto' : `${model?.provider ?? 'Provider'} · ${model?.name ?? conversation.modelId}`}</Text></View>
                <View style={styles.modeSwitch}><Pressable onPress={() => onModeChange('text')} accessibilityLabel="Modo texto" style={[styles.modeItem, responseMode === 'text' && styles.modeActive]}><Text style={[styles.modeText, responseMode === 'text' && styles.modeTextActive]}>Texto</Text></Pressable><Pressable onPress={() => onModeChange('voice')} accessibilityLabel="Modo voz" style={[styles.modeItem, responseMode === 'voice' && styles.modeActive]}><Text style={[styles.modeText, responseMode === 'voice' && styles.modeTextActive]}>Voz</Text></Pressable></View>
                <Pressable onPress={onMorePress} style={styles.headerButton} accessibilityLabel="Mais opções"><MoreHorizontal size={20} color={colors.muted} /></Pressable>
            </View>
            {project && <View style={styles.projectContext}><View><Text style={styles.projectContextTitle}>Contexto do projeto</Text><Text style={styles.projectContextSub}>Todas as conversas · incluídas</Text></View><Text style={styles.infoIcon}>i</Text></View>}
            <FlatList ref={listRef} data={conversation.messages} keyExtractor={(message) => message.id} contentContainerStyle={styles.messages} onLayout={({ nativeEvent }) => setListViewportHeight(nativeEvent.layout.height)} onScroll={handleScroll} onMomentumScrollEnd={handleScroll} scrollEventThrottle={16} onScrollToIndexFailed={({ index }) => requestAnimationFrame(() => listRef.current?.scrollToIndex({ index, viewPosition: 0, animated: false }))} onContentSizeChange={(_, height) => {
                setListContentHeight(height);
                const lastMessage = conversation.messages[conversation.messages.length - 1];
                if (lastMessage?.role === 'assistant' && lastMessage.status === 'streaming' && positionedResponseId.current !== lastMessage.id) {
                    positionedResponseId.current = lastMessage.id;
                    requestAnimationFrame(() => listRef.current?.scrollToIndex({ index: conversation.messages.length - 1, viewPosition: 0, animated: false }));
                }
                const distanceFromEnd = height - listViewportHeight - listScrollOffset.current;
                setShowScrollToEnd(distanceFromEnd > windowHeight * 0.06 && height > listViewportHeight);
            }} renderItem={({ item }) => <MessageBubble message={item} onSpeak={item.role === 'assistant' ? onSpeak : undefined} onStopSpeaking={onStopSpeaking} isSpeaking={speakingMessageId === item.id} onEditMessage={onEditMessage} onCopyResponse={onCopyResponse} isEditing={item.role === 'user' && editingMessageId === item.id} />} ListEmptyComponent={<View style={styles.emptyChat}><Sparkles size={22} color={colors.terracotta} /><Text style={styles.emptyChatTitle}>Começa pelo que tens em mente.</Text><Text style={styles.emptyChatText}>Esta conversa pode usar o contexto completo do projeto.</Text></View>} />
            {showScrollToEnd && <Pressable onPress={scrollToEnd} accessibilityLabel="Ir para o fim da resposta" style={[styles.scrollToEndButton, { bottom: scrollButtonBottom }]}><ArrowDown size={18} color={colors.surface} /></Pressable>}
            <View accessible accessibilityLabel="Composer" onLayout={(event) => setComposerHeight(event.nativeEvent.layout.height)} style={[styles.composer, { bottom: composerBottom }]}>
                <Pressable onPress={onModelPress} accessibilityLabel="Escolher modelo" style={styles.modelSelect}><View style={styles.modelDot} /><Text style={styles.modelText}>{model?.name ?? conversation.modelId}</Text><ChevronDown size={14} color={colors.terracotta} /></Pressable>
                <TextInput ref={composerRef} value={draft} onChangeText={onDraftChange} placeholder="Escreve uma mensagem..." placeholderTextColor={colors.muted} multiline style={styles.composerInput} accessibilityLabel="Prompt" />
                <View style={styles.composerActions}><Pressable onPress={onMicPress} style={styles.micButton} accessibilityLabel="Ditar prompt"><Mic size={19} color={colors.deep} /></Pressable><Pressable onPress={isStreaming ? onStop : onSend} disabled={!isStreaming && !draft.trim()} style={[styles.sendButton, (!draft.trim() && !isStreaming) && styles.sendDisabled]} accessibilityLabel={isStreaming ? 'Parar resposta' : 'Enviar prompt'}>{isStreaming ? <Square size={17} color={colors.surface} /> : <ArrowUp size={19} color={colors.surface} />}</Pressable></View>
            </View>
            <Text style={[styles.directNote, { bottom: keyboardHeight > 0 ? keyboardHeight + keyboardGap - directNoteGap : windowHeight * 0.011 }]}>{editingMessageId ? 'A editar · reenviar com contexto truncado' : responseMode === 'voice' ? 'Resposta por voz · texto mantido' : 'Resposta por texto · mudar para Voz'}</Text>
        </View>
    );
}

function renderMarkdownInline(content: string): ReactNode[] {
    return content.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) return <Text key={index} style={styles.markdownStrong}>{part.slice(2, -2)}</Text>;
        if (part.startsWith('`') && part.endsWith('`')) return <Text key={index} style={styles.markdownCode}>{part.slice(1, -1)}</Text>;
        return <Text key={index}>{part}</Text>;
    });
}

function MarkdownText({ content }: { content: string }) {
    return <View style={styles.markdownBody}>{content.split(/\r?\n/).map((line, index) => {
        const heading = line.match(/^#{1,3}\s+(.+)$/);
        const listItem = line.match(/^[-*]\s+(.+)$/);
        const headingContent = heading?.[1];
        const listContent = listItem?.[1];
        if (!line.trim()) return null;
        if (headingContent) return <Text key={index} style={styles.markdownHeading}>{renderMarkdownInline(headingContent)}</Text>;
        if (listContent) return <View key={index} style={styles.markdownListItem}><Text style={styles.markdownBullet}>-</Text><Text style={styles.assistantText}>{renderMarkdownInline(listContent)}</Text></View>;
        return <Text key={index} style={[styles.assistantText, styles.markdownParagraph]}>{renderMarkdownInline(line)}</Text>;
    })}</View>;
}

function MessageBubble({ message, onSpeak, onStopSpeaking, isSpeaking, onEditMessage, onCopyResponse, isEditing }: { message: Message; onSpeak?: (message: Message) => void; onStopSpeaking?: () => void; isSpeaking?: boolean; onEditMessage?: (message: Message) => void; onCopyResponse?: (content: string) => void; isEditing?: boolean }) {
    const [copied, setCopied] = useState(false);
    const handleCopy = async () => {
        if (!onCopyResponse) return;
        await onCopyResponse(message.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    if (message.role === 'user') return <View style={[styles.userMessage, isEditing && { borderWidth: 1, borderColor: colors.terracotta }]}><Text style={styles.userMessageText}>{message.content}</Text>{onEditMessage && <Pressable onPress={() => onEditMessage(message)} style={{ alignSelf: 'flex-end', marginTop: 6 }} accessibilityLabel="Editar mensagem"><Pencil size={14} color={colors.terracotta} /></Pressable>}</View>;
    return <View style={styles.assistantMessage}><View style={styles.assistantAvatar}><Sparkles size={13} color={colors.surface} /></View><View style={styles.assistantCopy}>{message.content ? <MarkdownText content={message.content} /> : <TypingIndicator />}{message.content && (onSpeak || isSpeaking) && <Pressable onPress={() => isSpeaking ? onStopSpeaking?.() : onSpeak?.(message)} style={styles.listenButton} accessibilityLabel={isSpeaking ? 'Parar de ouvir' : 'Ouvir resposta'}>{isSpeaking ? <Square size={14} color={colors.terracotta} /> : <Volume2 size={14} color={colors.terracotta} />}<Text style={styles.listenText}>{isSpeaking ? 'Parar de ouvir' : 'Ouvir resposta'}</Text></Pressable>}{message.content && onCopyResponse && <Pressable onPress={() => void handleCopy()} style={styles.listenButton} accessibilityLabel={copied ? 'Resposta copiada' : 'Copiar resposta'}><Copy size={14} color={colors.terracotta} /><Text style={styles.listenText}>{copied ? 'Copiado' : 'Copiar resposta'}</Text></Pressable>}</View></View>;
}

function TypingIndicator() {
    const dotOpacityOne = useRef(new Animated.Value(0.35)).current;
    const dotOpacityTwo = useRef(new Animated.Value(0.35)).current;
    const dotOpacityThree = useRef(new Animated.Value(0.35)).current;
    const dotOpacities = [dotOpacityOne, dotOpacityTwo, dotOpacityThree];

    useEffect(() => {
        const animations = dotOpacities.map((opacity, index) => Animated.loop(Animated.sequence([
            Animated.delay(index * 160),
            Animated.timing(opacity, { toValue: 1, duration: 260, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0.35, duration: 260, useNativeDriver: true }),
            Animated.delay(420 - index * 160),
        ])));
        animations.forEach((animation) => animation.start());
        return () => animations.forEach((animation) => animation.stop());
    }, [dotOpacityOne, dotOpacityTwo, dotOpacityThree]);

    return <View accessible accessibilityLabel="A preparar resposta" style={styles.typingIndicator}><Svg width="42" height="20" viewBox="0 0 42 20"><AnimatedCircle cx="7" cy="10" r="4" fill={colors.terracotta} opacity={dotOpacities[0]} /><AnimatedCircle cx="21" cy="10" r="4" fill={colors.terracotta} opacity={dotOpacities[1]} /><AnimatedCircle cx="35" cy="10" r="4" fill={colors.terracotta} opacity={dotOpacities[2]} /></Svg></View>;
}

function SettingsScreen({ keyConfigured, onOpenOpenAIKey, onDeleteOpenAIKey, customApiProfiles, onNewCustomApi, onEditCustomApi, onDeleteCustomApi, userName, nameDraft, onNameChange, onSaveName, voices, selectedVoice, onVoicePress, onPreviewVoice, voiceEngine, piperStatus, piperProgress, piperError, onPiperPress, paletteId, onPaletteChange, onBack }: {
    keyConfigured: boolean;
    onOpenOpenAIKey: () => void;
    onDeleteOpenAIKey: () => void;
    customApiProfiles: CustomProviderProfile[];
    onNewCustomApi: () => void;
    onEditCustomApi: (profile: CustomProviderProfile) => void;
    onDeleteCustomApi: (profile: CustomProviderProfile) => void;
    userName: string;
    nameDraft: string;
    onNameChange: (value: string) => void;
    onSaveName: () => void;
    voices: Speech.Voice[];
    selectedVoice?: string;
    onVoicePress: () => void;
    onPreviewVoice: () => void;
    voiceEngine: 'system' | 'piper';
    piperStatus: PiperVoiceStatus;
    piperProgress: number;
    piperError?: string;
    onPiperPress: () => void;
    paletteId: string;
    onPaletteChange: (value: string) => void;
    onBack: () => void;
}) {
    const selectedVoiceName = voiceEngine === 'piper' ? 'Piper · Tugão' : voices.find((voice) => voice.identifier === selectedVoice)?.name ?? 'Escolher no dispositivo';
    const piperStatusText = piperStatus === 'ready' ? 'Voz offline instalada neste dispositivo' : piperStatus === 'downloading' ? `A descarregar · ${Math.round(piperProgress * 100)}%` : piperStatus === 'native-missing' ? 'Recompilar o development build Android' : piperStatus === 'unavailable' ? 'Disponível apenas no Android' : 'Descarregar voz pt-PT · 63 MB';
    return (
        <ScrollView contentContainerStyle={styles.settingsContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={styles.settingsHeader}>
                <Pressable onPress={onBack} style={styles.headerButton}><ChevronLeft size={22} color={colors.deep} /></Pressable>
                <Text style={styles.overline}>DEFINIÇÕES</Text>
            </View>
            <Text style={styles.settingsTitle}>Tudo no teu controlo.</Text>
            <Text style={styles.settingsIntro}>Keys locais, respostas diretas e preferências que ficam contigo.</Text>

            <View style={styles.settingsSection}>
                <Text style={styles.sectionTitle}>PERFIL LOCAL</Text>
                <Text style={styles.rowSub}>{userName ? `Guardado como ${userName}` : 'Ainda não definido'}</Text>
                <TextInput
                    value={nameDraft}
                    onChangeText={onNameChange}
                    accessibilityLabel="Nome do utilizador"
                    placeholder="Como te chamas?"
                    placeholderTextColor={colors.muted}
                    style={styles.projectInput}
                    autoCapitalize="words"
                />
                <Pressable onPress={() => { Keyboard.dismiss(); void onSaveName(); }} disabled={!nameDraft.trim()} style={[styles.createProjectButton, !nameDraft.trim() && styles.sendDisabled]}>
                    <Text style={styles.createProjectText}>Guardar nome</Text>
                    <Check size={16} color={colors.surface} />
                </Pressable>
            </View>

            <View style={styles.settingsSection}>
                <Text style={styles.sectionTitle}>PROVIDER</Text>
                <View style={styles.providerProfileRow}>
                    <Pressable onPress={onOpenOpenAIKey} accessibilityLabel="Configurar key OpenAI" style={styles.providerProfileMain}>
                        <View style={styles.settingIcon}><KeyRound size={17} color={colors.deep} /></View>
                        <View style={styles.rowCopy}>
                            <Text style={styles.rowTitle}>OpenAI</Text>
                            <Text style={styles.rowSub}>{keyConfigured ? 'Key configurada neste dispositivo' : 'Nenhuma key configurada'}</Text>
                        </View>
                        <View style={[styles.statusDot, keyConfigured && styles.statusDotActive]} />
                    </Pressable>
                    {keyConfigured && <Pressable onPress={onOpenOpenAIKey} accessibilityLabel="Editar key OpenAI" style={styles.rowAction}><Pencil size={17} color={colors.terracotta} /></Pressable>}
                    {keyConfigured && <Pressable onPress={onDeleteOpenAIKey} accessibilityLabel="Apagar key OpenAI" style={styles.rowAction}><Trash2 size={17} color={colors.muted} /></Pressable>}
                </View>
            </View>

            <View style={styles.settingsSection}>
                <Text style={styles.sectionTitle}>API customizada</Text>
                {customApiProfiles.length === 0 && <Text style={styles.rowSub}>Nenhum provider customizado.</Text>}
                {customApiProfiles.map((profile) => (
                    <View key={profile.id} style={styles.providerProfileRow}>
                        <Pressable
                            onPress={() => onEditCustomApi(profile)}
                            accessibilityLabel={`Editar provider ${profile.name}`}
                            style={styles.providerProfileMain}
                        >
                            <View style={styles.settingIcon}><KeyRound size={17} color={colors.deep} /></View>
                            <View style={styles.rowCopy}>
                                <Text style={styles.rowTitle}>{profile.name}</Text>
                                <Text style={styles.rowSub}>{profile.model}</Text>
                            </View>
                            <View style={[styles.statusDot, styles.statusDotActive]} />
                        </Pressable>
                        <Pressable
                            onPress={() => onDeleteCustomApi(profile)}
                            accessibilityLabel={`Apagar provider ${profile.name}`}
                            style={styles.rowAction}
                        >
                            <Trash2 size={17} color={colors.muted} />
                        </Pressable>
                    </View>
                ))}
                <Pressable onPress={onNewCustomApi} accessibilityLabel="Adicionar provider customizado" style={styles.createProviderButton}>
                    <Plus size={17} color={colors.terracotta} />
                    <Text style={styles.previewText}>Adicionar provider</Text>
                </Pressable>
            </View>

            <View style={styles.settingsSection}>
                <Text style={styles.sectionTitle}>VOZ DA IA</Text>
                <Pressable onPress={onVoicePress} accessibilityLabel="Selecionar voz" style={styles.settingCard}>
                    <View style={[styles.settingIcon, styles.voiceIcon]}><Volume2 size={17} color={colors.deep} /></View>
                    <View style={styles.rowCopy}>
                        <Text style={styles.rowTitle}>{selectedVoiceName}</Text>
                        <Text style={styles.rowSub}>Português (Portugal)</Text>
                    </View>
                    <ChevronDown size={18} color={colors.terracotta} />
                </Pressable>
                <Pressable onPress={onPreviewVoice} style={styles.previewButton}>
                    <Volume2 size={16} color={colors.terracotta} />
                    <Text style={styles.previewText}>Pré-escutar voz</Text>
                </Pressable>
                <Pressable onPress={onPiperPress} disabled={piperStatus === 'downloading' || piperStatus === 'unavailable' || piperStatus === 'native-missing'} accessibilityLabel="Ativar Piper offline" style={styles.settingCard}>
                    <View style={[styles.settingIcon, styles.voiceIcon]}><ShieldCheck size={17} color={colors.deep} /></View>
                    <View style={styles.rowCopy}>
                        <Text style={styles.rowTitle}>{voiceEngine === 'piper' ? 'Piper offline ativo' : 'Piper offline'}</Text>
                        <Text style={styles.rowSub}>{piperStatusText}</Text>
                    </View>
                    {piperStatus === 'ready' && voiceEngine === 'piper' && <Check size={17} color={colors.terracotta} />}
                </Pressable>
                {piperError && <Text style={styles.providerError}>{piperError}</Text>}
            </View>

            <View style={styles.settingsSection}>
                <Text style={styles.sectionTitle}>APARÊNCIA</Text>
                <Text style={styles.appearanceTitle}>Paleta terracota</Text>
                <View style={styles.paletteRow}>
                    {palette.map((item) => (
                        <Pressable
                            key={item.id}
                            onPress={() => onPaletteChange(item.id)}
                            accessibilityLabel={`Paleta ${item.label}`}
                            style={[styles.swatch, { backgroundColor: item.accent }, paletteId === item.id && styles.selectedSwatch]}
                        />
                    ))}
                </View>
            </View>

            <View style={styles.localNotice}>
                <ShieldCheck size={18} color={colors.deep} />
                <View style={styles.rowCopy}>
                    <Text style={styles.rowTitle}>Histórico local</Text>
                    <Text style={styles.rowSub}>As conversas ficam neste dispositivo.</Text>
                </View>
            </View>
        </ScrollView>
    );
}

function BottomTabs({ active, onChange, onNewConversation }: { active: Tab; onChange: (tab: Tab) => void; onNewConversation: () => void }) {
    const { bottom } = useSafeAreaInsets();
    return <View style={[styles.bottomTabs, { height: 76 + bottom, paddingBottom: bottom }]}><Pressable onPress={() => onChange('home')} accessibilityLabel="Início" style={styles.tabButton}><FolderKanban size={19} color={active === 'home' ? colors.deep : colors.muted} /><Text style={[styles.tabText, active === 'home' && styles.tabTextActive]}>Início</Text></Pressable><Pressable onPress={onNewConversation} accessibilityLabel="Nova conversa pelo menu" style={styles.tabButton}><Plus size={20} color={colors.muted} /><Text style={styles.tabText}>Chat</Text></Pressable><Pressable onPress={() => onChange('settings')} accessibilityLabel="Definições" style={styles.tabButton}><Settings2 size={19} color={active === 'settings' ? colors.deep : colors.muted} /><Text style={[styles.tabText, active === 'settings' && styles.tabTextActive]}>Definições</Text></Pressable></View>;
}

function SheetFrame({ children }: { children: ReactNode }) {
    const keyboardHeight = useKeyboardHeight();
    const { height: windowHeight } = useWindowDimensions();
    const sheetScrollRef = useRef<ScrollView>(null);
    const androidVisibleHeight = Math.max(240, windowHeight - keyboardHeight);
    const handleInputFocus = (event: { nativeEvent: { target: number } }) => {
        if (Platform.OS !== 'android') return;
        const target = event.nativeEvent?.target;
        if (typeof target !== 'number') return;
        requestAnimationFrame(() => sheetScrollRef.current?.scrollResponderScrollNativeHandleToKeyboard(target, 20, true));
    };

    return <View style={[styles.modalBackdrop, Platform.OS === 'android' && keyboardHeight > 0 && { paddingBottom: keyboardHeight }]}><KeyboardAvoidingView style={styles.sheetKeyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}><SafeAreaView edges={['bottom']} style={[styles.sheet, styles.sheetSafeArea, Platform.OS === 'android' && keyboardHeight > 0 && { maxHeight: androidVisibleHeight }]}><ScrollView ref={sheetScrollRef} onFocus={handleInputFocus} contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">{children}</ScrollView></SafeAreaView></KeyboardAvoidingView></View>;
}

function ProjectDetailsSheet({ project, conversations, onClose, onConversationPress, onNewConversation, onRemoveConversation, onDeleteProject }: { project?: Project; conversations: Conversation[]; onClose: () => void; onConversationPress: (conversation: Conversation) => void; onNewConversation: (project: Project) => void; onRemoveConversation: (conversationId: string) => void; onDeleteProject: (project: Project) => void }) {
    if (!project) return null;
    const projectConversations = conversations.filter((conversation) => conversation.projectId === project.id).sort((first, second) => second.updatedAt - first.updatedAt);
    return <Modal visible transparent animationType="slide" onRequestClose={onClose}><SheetFrame><View style={styles.sheetHeader}><View><Text style={styles.sheetTitle}>{project.name}</Text><Text style={styles.projectDetailSubtitle}>{project.description ?? 'Conversas deste projeto'}</Text></View><Pressable onPress={onClose} accessibilityLabel="Fechar"><X size={20} color={colors.deep} /></Pressable></View><Pressable onPress={() => onNewConversation(project)} accessibilityLabel="Nova conversa no projeto" style={styles.createProjectButton}><Plus size={17} color={colors.surface} /><Text style={styles.createProjectText}>Nova conversa neste projeto</Text></Pressable><Text style={styles.fieldLabel}>CONVERSAS DO PROJETO</Text>{projectConversations.length === 0 ? <Text style={styles.projectEmptyText}>Ainda não existem conversas neste projeto.</Text> : projectConversations.map((conversation) => <View key={conversation.id} style={styles.projectConversationRow}><Pressable onPress={() => onConversationPress(conversation)} style={styles.projectConversationMain}><View style={styles.conversationIcon}><Sparkles size={14} color={colors.deep} /></View><View style={styles.rowCopy}><Text style={styles.rowTitle}>{conversation.title}</Text><Text style={styles.rowSub}>{conversation.messages[0]?.content ?? 'Sem mensagens ainda'}</Text></View></Pressable><Pressable onPress={() => onRemoveConversation(conversation.id)} accessibilityLabel={`Retirar ${conversation.title} do projeto`} style={styles.rowAction}><FolderMinus size={17} color={colors.terracotta} /></Pressable></View>)}<Pressable onPress={() => onDeleteProject(project)} accessibilityLabel="Apagar projeto" style={styles.deleteProjectButton}><Trash2 size={17} color={colors.terracotta} /><Text style={styles.previewText}>Apagar projeto</Text></Pressable></SheetFrame></Modal>;
}

function ProjectSheet({ visible, projects, onSelect, onCreate, onClose }: { visible: boolean; projects: Project[]; onSelect: (projectId: string) => void; onCreate: () => void; onClose: () => void }) {
    return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><SheetFrame><View style={styles.sheetHeader}><Text style={styles.sheetTitle}>Adicionar ao projeto</Text><Pressable onPress={onClose} accessibilityLabel="Fechar"><X size={20} color={colors.deep} /></Pressable></View>{projects.map((project) => <Pressable key={project.id} onPress={() => onSelect(project.id)} style={styles.sheetRow}><FolderKanban size={17} color={colors.terracotta} /><View style={styles.rowCopy}><Text style={styles.rowTitle}>{project.name}</Text><Text style={styles.rowSub}>Adicionar a este contexto</Text></View><ChevronDown size={17} color={colors.muted} /></Pressable>)}<Pressable onPress={onCreate} style={styles.createProjectRow}><Plus size={17} color={colors.terracotta} /><Text style={styles.previewText}>Criar novo projeto</Text></Pressable></SheetFrame></Modal>;
}

function NewProjectSheet({ visible, name, onNameChange, onCreate, onClose }: { visible: boolean; name: string; onNameChange: (value: string) => void; onCreate: () => void; onClose: () => void }) {
    return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><SheetFrame><View style={styles.sheetHeader}><Text style={styles.sheetTitle}>Novo projeto</Text><Pressable onPress={onClose} accessibilityLabel="Fechar"><X size={20} color={colors.deep} /></Pressable></View><Text style={styles.fieldLabel}>NOME DO PROJETO</Text><TextInput value={name} onChangeText={onNameChange} accessibilityLabel="Nome do projeto" autoFocus placeholder="Ex.: Lançamento 2026" placeholderTextColor={colors.muted} style={styles.projectInput} /><Pressable onPress={onCreate} disabled={!name.trim()} style={[styles.createProjectButton, !name.trim() && styles.sendDisabled]}><Text style={styles.createProjectText}>Criar projeto</Text><ArrowUp size={17} color={colors.surface} /></Pressable></SheetFrame></Modal>;
}

type CustomApiConfiguration = { id?: string; name: string; endpoint: string; model: string; key: string };

function OpenAIKeySheet({ visible, configured, apiKey, onApiKeyChange, onSave, onClose }: { visible: boolean; configured: boolean; apiKey: string; onApiKeyChange: (value: string) => void; onSave: () => void; onClose: () => void }) {
    return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><SheetFrame><View style={styles.sheetHeader}><Text style={styles.sheetTitle}>{configured ? 'Editar key OpenAI' : 'Configurar OpenAI'}</Text><Pressable onPress={onClose} accessibilityLabel="Fechar"><X size={20} color={colors.deep} /></Pressable></View><Text style={styles.settingsIntro}>A key fica apenas neste dispositivo e é usada diretamente nas chamadas à OpenAI.</Text><Text style={styles.fieldLabel}>CHAVE API</Text><TextInput value={apiKey} onChangeText={onApiKeyChange} accessibilityLabel="API key" secureTextEntry autoCapitalize="none" placeholder={configured ? 'Introduzir nova API key' : 'sk-...'} placeholderTextColor={colors.muted} style={styles.projectInput} /><Pressable onPress={() => { Keyboard.dismiss(); onSave(); }} disabled={!apiKey.trim()} style={[styles.createProjectButton, !apiKey.trim() && styles.sendDisabled]}><Text style={styles.createProjectText}>Guardar key</Text><Check size={16} color={colors.surface} /></Pressable></SheetFrame></Modal>;
}

function splitApiEndpoint(endpoint: string) {
    try {
        const url = new URL(endpoint);
        return { host: `${url.protocol}//${url.host}`, path: `${url.pathname}${url.search}` || '/v1/chat/completions' };
    } catch {
        return { host: endpoint, path: '/v1/chat/completions' };
    }
}

function CustomApiSheet({ visible, profile, onClose, onSave }: { visible: boolean; profile?: CustomProviderProfile; onClose: () => void; onSave: (configuration: CustomApiConfiguration) => Promise<{ ok: true } | { ok: false; message: string }> }) {
    const [configurationName, setConfigurationName] = useState('');
    const [host, setHost] = useState('');
    const [path, setPath] = useState('/v1/chat/completions');
    const [selectedModel, setSelectedModel] = useState('');
    const [key, setKey] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!visible) return;
        const parts = splitApiEndpoint(profile?.endpoint ?? '');
        setConfigurationName(profile?.name || 'API customizada');
        setHost(parts.host);
        setPath(parts.path);
        setSelectedModel(profile?.model ?? '');
        setKey('');
        setError('');
    }, [profile, visible]);

    const fullEndpoint = `${host.trim().replace(/\/$/, '')}/${path.trim().replace(/^\//, '')}`;
    const canSave = Boolean(configurationName.trim() && isHttpUrl(fullEndpoint) && selectedModel.trim() && (key.trim() || profile));
    const handleSave = async () => {
        if (!canSave || saving) return;
        setSaving(true);
        setError('');
        const result = await onSave({ id: profile?.id, name: configurationName, endpoint: fullEndpoint, model: selectedModel, key });
        if (!result.ok) setError(result.message);
        setSaving(false);
    };
    return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><SheetFrame><View style={styles.sheetHeader}><Text style={styles.sheetTitle}>{profile ? 'Editar provider' : 'Adicionar provider'}</Text><Pressable onPress={onClose} accessibilityLabel="Fechar"><X size={20} color={colors.deep} /></Pressable></View><Text style={styles.settingsIntro}>A ligação é testada antes de este provider ficar disponível no seletor.</Text><Text style={styles.fieldLabel}>NOME DA CONFIGURAÇÃO</Text><TextInput value={configurationName} onChangeText={setConfigurationName} accessibilityLabel="Nome da configuração" placeholder="Ex.: Servidor local" placeholderTextColor={colors.muted} style={styles.projectInput} autoCapitalize="words" /><Text style={styles.fieldLabel}>MODO API</Text><View style={styles.apiModeCard}><View style={styles.modelDot} /><View style={styles.rowCopy}><Text style={styles.rowTitle}>Compatível com API OpenAI</Text><Text style={styles.rowSub}>Chat Completions com streaming SSE</Text></View><Check size={17} color={colors.terracotta} /></View><Text style={styles.fieldLabel}>CHAVE API</Text><View style={styles.keyInputRow}><TextInput value={key} onChangeText={setKey} accessibilityLabel="API key customizada" secureTextEntry placeholder={profile ? 'Key guardada · introduzir para substituir' : 'Introduzir API key'} placeholderTextColor={colors.muted} style={styles.keyInput} autoCapitalize="none" /></View><Text style={styles.fieldLabel}>ENDPOINT</Text><View style={styles.hostPathRow}><TextInput value={host} onChangeText={setHost} accessibilityLabel="Host da API" placeholder="https://api.exemplo.com" placeholderTextColor={colors.muted} style={[styles.projectInput, styles.hostInput]} autoCapitalize="none" /><TextInput value={path} onChangeText={setPath} accessibilityLabel="Caminho da API" placeholder="/v1/chat/completions" placeholderTextColor={colors.muted} style={[styles.projectInput, styles.pathInput]} autoCapitalize="none" /></View><Text style={styles.endpointPreview}>{fullEndpoint}</Text><Text style={styles.fieldLabel}>MODELO</Text><TextInput value={selectedModel} onChangeText={setSelectedModel} accessibilityLabel="Modelo da API customizada" placeholder="Ex.: gpt-4o-mini" placeholderTextColor={colors.muted} style={styles.projectInput} autoCapitalize="none" /><View style={styles.apiLimitRow}><Text style={styles.rowSub}>Limite de resposta</Text><Text style={styles.rowTitle}>1200 tokens</Text></View>{error && <Text style={styles.providerError}>{error}</Text>}<Pressable onPress={() => void handleSave()} disabled={!canSave || saving} style={[styles.createProjectButton, (!canSave || saving) && styles.sendDisabled]}><Text style={styles.createProjectText}>{saving ? 'A testar ligação...' : profile ? 'Testar e guardar' : 'Testar e adicionar'}</Text><Check size={16} color={colors.surface} /></Pressable></SheetFrame></Modal>;
}

function ProfileSheet({ visible, name, onNameChange, onSave, onClose }: { visible: boolean; name: string; onNameChange: (value: string) => void; onSave: () => void; onClose: () => void }) {
    return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><SheetFrame><View style={styles.sheetHeader}><Text style={styles.sheetTitle}>Como te chamas?</Text><Pressable onPress={onClose} accessibilityLabel="Fechar"><X size={20} color={colors.deep} /></Pressable></View><Text style={styles.settingsIntro}>O nome fica guardado apenas neste dispositivo e pode ser alterado em Definições.</Text><TextInput value={name} onChangeText={onNameChange} accessibilityLabel="Nome do utilizador" autoFocus autoCapitalize="words" placeholder="O teu nome" placeholderTextColor={colors.muted} style={styles.projectInput} /><Pressable onPress={() => { Keyboard.dismiss(); onSave(); }} disabled={!name.trim()} style={[styles.createProjectButton, !name.trim() && styles.sendDisabled]}><Text style={styles.createProjectText}>Guardar nome</Text><Check size={16} color={colors.surface} /></Pressable><Pressable onPress={onClose} style={styles.previewButton}><Text style={styles.previewText}>Agora não</Text></Pressable></SheetFrame></Modal>;
}

function ModelSheet({ visible, models, selectedModelId, onSelect, onClose }: { visible: boolean; models: ModelDefinition[]; selectedModelId: string; onSelect: (modelId: string) => void; onClose: () => void }) {
    return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><SheetFrame><View style={styles.sheetHeader}><Text style={styles.sheetTitle}>Escolher modelo</Text><Pressable onPress={onClose} accessibilityLabel="Fechar"><X size={20} color={colors.deep} /></Pressable></View>{models.map((model) => <Pressable key={model.id} onPress={() => onSelect(model.id)} style={styles.sheetRow}><View style={styles.modelDot} /><View style={styles.rowCopy}><Text style={styles.rowTitle}>{model.name}</Text><Text style={styles.rowSub}>{model.provider} · {Math.round(model.contextWindow / 1000)}k contexto</Text></View>{model.id === selectedModelId && <Check size={17} color={colors.terracotta} />}</Pressable>)}</SheetFrame></Modal>;
}

function ChatOptionsSheet({ visible, onClose, onNewConversation, onAddToProject, onDelete }: { visible: boolean; onClose: () => void; onNewConversation: () => void; onAddToProject: () => void; onDelete: () => void }) {
    return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <SheetFrame>
            <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>Opções</Text>
                <Pressable onPress={onClose}><X size={20} color={colors.deep} /></Pressable>
            </View>
            <Pressable onPress={onNewConversation} style={styles.sheetRow}>
                <Plus size={17} color={colors.terracotta} />
                <View style={styles.rowCopy}>
                    <Text style={styles.rowTitle}>Nova conversa</Text>
                    <Text style={styles.rowSub}>Criar mantendo o contexto do projeto</Text>
                </View>
                <ChevronDown size={17} color={colors.muted} />
            </Pressable>
            <Pressable onPress={onAddToProject} style={styles.sheetRow}>
                <FolderPlus size={17} color={colors.terracotta} />
                <View style={styles.rowCopy}>
                    <Text style={styles.rowTitle}>Adicionar ao projeto</Text>
                    <Text style={styles.rowSub}>Escolher o contexto desta conversa</Text>
                </View>
            </Pressable>
            <Pressable onPress={onDelete} style={styles.sheetRow}>
                <Trash2 size={17} color={colors.muted} />
                <View style={styles.rowCopy}>
                    <Text style={styles.rowTitle}>Apagar conversa</Text>
                    <Text style={styles.rowSub}>Remover apenas deste dispositivo</Text>
                </View>
            </Pressable>
        </SheetFrame>
    </Modal>;
}

function VoiceSheet({ visible, voices, selectedVoice, onSelect, onClose }: { visible: boolean; voices: Speech.Voice[]; selectedVoice?: string; onSelect: (voice?: string) => void; onClose: () => void }) {
    return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><SheetFrame><View style={styles.sheetHeader}><Text style={styles.sheetTitle}>Voz da IA</Text><Pressable onPress={onClose} accessibilityLabel="Fechar"><X size={20} color={colors.deep} /></Pressable></View><Pressable onPress={() => onSelect(undefined)} style={styles.sheetRow}><Volume2 size={17} color={colors.terracotta} /><View style={styles.rowCopy}><Text style={styles.rowTitle}>Voz do dispositivo</Text><Text style={styles.rowSub}>Escolha automática do Android</Text></View>{selectedVoice === undefined && <Check size={17} color={colors.terracotta} />}</Pressable>{voices.length === 0 ? <Text style={styles.noVoices}>Nenhuma voz pt-PT foi encontrada neste dispositivo.</Text> : voices.map((voice) => <Pressable key={voice.identifier} onPress={() => onSelect(voice.identifier)} style={styles.sheetRow}><Volume2 size={17} color={colors.terracotta} /><View style={styles.rowCopy}><Text style={styles.rowTitle}>{voice.name}</Text><Text style={styles.rowSub}>{voice.language} · {voice.quality}</Text></View>{selectedVoice === voice.identifier && <Check size={17} color={colors.terracotta} />}</Pressable>)}</SheetFrame></Modal>;
}
