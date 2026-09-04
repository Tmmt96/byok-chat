import * as SQLite from 'expo-sqlite';
import type { Conversation, Message, Project } from '../domain/types';

const database = SQLite.openDatabaseSync('byok-chat.db');

export type StoredAppData = {
    initialized: boolean;
    projects: Project[];
    conversations: Conversation[];
};

type ProjectRow = {
    id: string;
    name: string;
    description: string | null;
    color_token: Project['colorToken'];
    updated_at: number;
};

type ConversationRow = {
    id: string;
    project_id: string | null;
    title: string;
    model_id: string;
    updated_at: number;
};

type MessageRow = {
    id: string;
    conversation_id: string;
    role: Message['role'];
    content: string;
    status: Message['status'];
    created_at: number;
};

export function initializeDatabase() {
    database.execSync(`
    PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      color_token TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      project_id TEXT,
      model_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY NOT NULL,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS conversations_project_updated_idx ON conversations(project_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS messages_conversation_created_idx ON messages(conversation_id, created_at);
  `);
}

export function loadAppData(): StoredAppData {
    initializeDatabase();
    const projects = database.getAllSync<ProjectRow>('SELECT id, name, description, color_token, updated_at FROM projects ORDER BY updated_at DESC');
    const conversations = database.getAllSync<ConversationRow>('SELECT id, project_id, title, model_id, updated_at FROM conversations ORDER BY updated_at DESC');
    const messages = database.getAllSync<MessageRow>('SELECT id, conversation_id, role, content, status, created_at FROM messages ORDER BY created_at ASC');
    const messagesByConversation = new Map<string, Message[]>();

    for (const message of messages) {
        const conversationMessages = messagesByConversation.get(message.conversation_id) ?? [];
        conversationMessages.push({
            id: message.id,
            role: message.role,
            content: message.content,
            status: message.status,
            createdAt: message.created_at,
        });
        messagesByConversation.set(message.conversation_id, conversationMessages);
    }

    const initialized = database.getFirstSync<{ value: string }>('SELECT value FROM app_state WHERE key = ?', 'initialized')?.value === '1';

    return {
        initialized,
        projects: projects.map((project) => ({
            id: project.id,
            name: project.name,
            description: project.description ?? undefined,
            colorToken: project.color_token,
            updatedAt: project.updated_at,
        })),
        conversations: conversations.map((conversation) => ({
            id: conversation.id,
            projectId: conversation.project_id ?? undefined,
            title: conversation.title,
            modelId: conversation.model_id,
            updatedAt: conversation.updated_at,
            messages: messagesByConversation.get(conversation.id) ?? [],
        })),
    };
}

export function saveAppData(projects: Project[], conversations: Conversation[]) {
    initializeDatabase();
    database.withTransactionSync(() => {
        database.runSync('DELETE FROM messages');
        database.runSync('DELETE FROM conversations');
        database.runSync('DELETE FROM projects');

        for (const project of projects) {
            database.runSync(
                'INSERT INTO projects (id, name, description, color_token, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
                project.id,
                project.name,
                project.description ?? null,
                project.colorToken,
                project.updatedAt,
                project.updatedAt,
            );
        }

        for (const conversation of conversations) {
            database.runSync(
                'INSERT INTO conversations (id, title, project_id, model_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
                conversation.id,
                conversation.title,
                conversation.projectId ?? null,
                conversation.modelId,
                conversation.messages[0]?.createdAt ?? conversation.updatedAt,
                conversation.updatedAt,
            );
            for (const message of conversation.messages) {
                database.runSync(
                    'INSERT INTO messages (id, conversation_id, role, content, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
                    message.id,
                    conversation.id,
                    message.role,
                    message.content,
                    message.status,
                    message.createdAt,
                );
            }
        }

        database.runSync('INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?)', 'initialized', '1');
    });
}
