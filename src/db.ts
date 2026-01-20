import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'gymtrack';
const DB_VERSION = 1;

export interface MuscleGroup {
    id: string;
    name: string;
}

export interface Exercise {
    id: string;
    name: string;
    muscleGroupIds: string[];
}

export interface TemplateExercise {
    exerciseId: string;
    sets: number;
    targetReps: number;
    restSeconds: number;
}

export interface WorkoutTemplate {
    id: string;
    name: string;
    exercises: TemplateExercise[];
}

export interface SetData {
    setNumber: number;
    weight: number;
    reps: number;
    rpe: number;
    technicalFailure: boolean;
    tutMs: number;
    restMs: number;
    startTime: number;
    endTime: number;
}

export interface SessionExercise {
    exerciseId: string;
    sets: SetData[];
}

export interface Session {
    id: string;
    templateId: string;
    templateName: string;
    startTime: number;
    endTime?: number;
    exercises: SessionExercise[];
    completed: boolean;
}

interface GymTrackDB {
    muscleGroups: MuscleGroup;
    exercises: Exercise;
    templates: WorkoutTemplate;
    sessions: Session;
}

let dbPromise: Promise<IDBPDatabase<GymTrackDB>> | null = null;

function getDB() {
    if (!dbPromise) {
        dbPromise = openDB<GymTrackDB>(DB_NAME, DB_VERSION, {
            upgrade(db) {
                if (!db.objectStoreNames.contains('muscleGroups')) {
                    db.createObjectStore('muscleGroups', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('exercises')) {
                    db.createObjectStore('exercises', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('templates')) {
                    db.createObjectStore('templates', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('sessions')) {
                    db.createObjectStore('sessions', { keyPath: 'id' });
                }
            },
        });
    }
    return dbPromise;
}

// Generic CRUD operations
export const db = {
    // Muscle Groups
    async getAllMuscleGroups(): Promise<MuscleGroup[]> {
        const database = await getDB();
        return database.getAll('muscleGroups');
    },

    async getMuscleGroup(id: string): Promise<MuscleGroup | undefined> {
        const database = await getDB();
        return database.get('muscleGroups', id);
    },

    async saveMuscleGroup(group: MuscleGroup): Promise<void> {
        const database = await getDB();
        await database.put('muscleGroups', group);
    },

    async deleteMuscleGroup(id: string): Promise<void> {
        const database = await getDB();
        await database.delete('muscleGroups', id);
    },

    // Exercises
    async getAllExercises(): Promise<Exercise[]> {
        const database = await getDB();
        return database.getAll('exercises');
    },

    async getExercise(id: string): Promise<Exercise | undefined> {
        const database = await getDB();
        return database.get('exercises', id);
    },

    async saveExercise(exercise: Exercise): Promise<void> {
        const database = await getDB();
        await database.put('exercises', exercise);
    },

    async deleteExercise(id: string): Promise<void> {
        const database = await getDB();
        await database.delete('exercises', id);
    },

    // Templates
    async getAllTemplates(): Promise<WorkoutTemplate[]> {
        const database = await getDB();
        return database.getAll('templates');
    },

    async getTemplate(id: string): Promise<WorkoutTemplate | undefined> {
        const database = await getDB();
        return database.get('templates', id);
    },

    async saveTemplate(template: WorkoutTemplate): Promise<void> {
        const database = await getDB();
        await database.put('templates', template);
    },

    async deleteTemplate(id: string): Promise<void> {
        const database = await getDB();
        await database.delete('templates', id);
    },

    // Sessions
    async getAllSessions(): Promise<Session[]> {
        const database = await getDB();
        return database.getAll('sessions');
    },

    async getSession(id: string): Promise<Session | undefined> {
        const database = await getDB();
        return database.get('sessions', id);
    },

    async saveSession(session: Session): Promise<void> {
        const database = await getDB();
        await database.put('sessions', session);
    },

    async deleteSession(id: string): Promise<void> {
        const database = await getDB();
        await database.delete('sessions', id);
    },

    async getActiveSession(): Promise<Session | undefined> {
        const database = await getDB();
        const sessions = await database.getAll('sessions');
        return sessions.find(s => !s.completed);
    },
};

// Utility to generate IDs
export function generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}
