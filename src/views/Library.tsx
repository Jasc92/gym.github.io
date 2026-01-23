import { useEffect, useState } from 'react'
import {
    db,
    generateId,
    type MuscleGroup,
    type Exercise,
    type WorkoutTemplate,
    type TemplateExercise
} from '../db'
import Modal from '../components/Modal'

type Tab = 'groups' | 'exercises' | 'templates'

interface LibraryExport {
    muscleGroups: MuscleGroup[]
    exercises: Exercise[]
    templates: WorkoutTemplate[]
}

export default function Library() {
    const [activeTab, setActiveTab] = useState<Tab>('groups')
    const [muscleGroups, setMuscleGroups] = useState<MuscleGroup[]>([])
    const [exercises, setExercises] = useState<Exercise[]>([])
    const [templates, setTemplates] = useState<WorkoutTemplate[]>([])
    const [showExportModal, setShowExportModal] = useState(false)
    const [importData, setImportData] = useState('')
    const [importError, setImportError] = useState('')

    useEffect(() => {
        loadData()
    }, [])

    async function loadData() {
        const [groups, exs, temps] = await Promise.all([
            db.getAllMuscleGroups(),
            db.getAllExercises(),
            db.getAllTemplates()
        ])
        setMuscleGroups(groups)
        setExercises(exs)
        setTemplates(temps)
    }

    function generateExportJSON(): string {
        const data: LibraryExport = {
            muscleGroups,
            exercises,
            templates
        }
        return JSON.stringify(data, null, 2)
    }

    async function copyExportToClipboard() {
        await navigator.clipboard.writeText(generateExportJSON())
        if ('vibrate' in navigator) {
            navigator.vibrate(100)
        }
    }

    async function handleImport() {
        setImportError('')
        try {
            const data: LibraryExport = JSON.parse(importData)

            // Validate structure
            if (!data.muscleGroups || !data.exercises || !data.templates) {
                throw new Error('Estructura JSON inválida')
            }

            // Import muscle groups
            for (const group of data.muscleGroups) {
                await db.saveMuscleGroup(group)
            }

            // Import exercises
            for (const exercise of data.exercises) {
                await db.saveExercise(exercise)
            }

            // Import templates
            for (const template of data.templates) {
                await db.saveTemplate(template)
            }

            await loadData()
            setImportData('')
            setShowExportModal(false)
        } catch (e) {
            setImportError('Error al importar: ' + (e instanceof Error ? e.message : 'JSON inválido'))
        }
    }

    return (
        <div className="page">
            <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1 className="page-title">Biblioteca</h1>
                <button
                    className="btn-secondary"
                    style={{ padding: 'var(--spacing-sm) var(--spacing-md)', fontSize: '0.875rem' }}
                    onClick={() => setShowExportModal(true)}
                >
                    📦 Datos
                </button>
            </header>

            <div className="tabs" style={{ display: 'flex', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-lg)' }}>
                {(['groups', 'exercises', 'templates'] as Tab[]).map(tab => (
                    <button
                        key={tab}
                        className={`btn-secondary ${activeTab === tab ? 'active' : ''}`}
                        style={{
                            flex: 1,
                            padding: 'var(--spacing-sm)',
                            background: activeTab === tab ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                            color: activeTab === tab ? 'var(--bg-primary)' : 'var(--text-primary)'
                        }}
                        onClick={() => setActiveTab(tab)}
                    >
                        {tab === 'groups' ? 'Grupos' : tab === 'exercises' ? 'Ejercicios' : 'Entrenos'}
                    </button>
                ))}
            </div>

            {activeTab === 'groups' && (
                <MuscleGroupsTab
                    groups={muscleGroups}
                    onUpdate={loadData}
                />
            )}
            {activeTab === 'exercises' && (
                <ExercisesTab
                    exercises={exercises}
                    muscleGroups={muscleGroups}
                    onUpdate={loadData}
                />
            )}
            {activeTab === 'templates' && (
                <TemplatesTab
                    templates={templates}
                    exercises={exercises}
                    onUpdate={loadData}
                />
            )}

            {/* Import/Export Modal */}
            <Modal
                isOpen={showExportModal}
                onClose={() => { setShowExportModal(false); setImportError('') }}
                title="Importar / Exportar Datos"
            >
                <div>
                    <p className="text-muted" style={{ fontSize: '0.875rem', marginBottom: 'var(--spacing-sm)' }}>
                        Exportar configuración actual:
                    </p>
                    <textarea
                        readOnly
                        value={generateExportJSON()}
                        style={{ marginBottom: 'var(--spacing-sm)', minHeight: '120px' }}
                    />
                    <button
                        className="btn-action btn-primary"
                        onClick={copyExportToClipboard}
                        style={{ marginBottom: 'var(--spacing-lg)' }}
                    >
                        📋 Copiar JSON
                    </button>

                    <hr style={{ border: 'none', borderTop: '1px solid var(--bg-tertiary)', margin: 'var(--spacing-md) 0' }} />

                    <p className="text-muted" style={{ fontSize: '0.875rem', marginBottom: 'var(--spacing-sm)' }}>
                        Importar configuración (pegar JSON):
                    </p>
                    <textarea
                        value={importData}
                        onChange={e => setImportData(e.target.value)}
                        placeholder='{"muscleGroups": [...], "exercises": [...], "templates": [...]}'
                        style={{ marginBottom: 'var(--spacing-sm)', minHeight: '120px' }}
                    />
                    {importError && (
                        <p style={{ color: 'var(--accent-danger)', fontSize: '0.875rem', marginBottom: 'var(--spacing-sm)' }}>
                            {importError}
                        </p>
                    )}
                    <button
                        className="btn-action btn-secondary"
                        onClick={handleImport}
                        disabled={!importData.trim()}
                    >
                        📥 Importar
                    </button>
                </div>
            </Modal>
        </div>
    )
}

// Muscle Groups Tab
function MuscleGroupsTab({ groups, onUpdate }: { groups: MuscleGroup[], onUpdate: () => void }) {
    const [newName, setNewName] = useState('')
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editName, setEditName] = useState('')

    async function handleAdd() {
        if (!newName.trim()) return
        await db.saveMuscleGroup({ id: generateId(), name: newName.trim() })
        setNewName('')
        onUpdate()
    }

    async function handleSaveEdit(id: string) {
        if (!editName.trim()) return
        await db.saveMuscleGroup({ id, name: editName.trim() })
        setEditingId(null)
        onUpdate()
    }

    async function handleDelete(id: string) {
        await db.deleteMuscleGroup(id)
        onUpdate()
    }

    return (
        <div>
            <div className="flex gap-sm" style={{ marginBottom: 'var(--spacing-md)' }}>
                <input
                    type="text"
                    placeholder="Nuevo grupo muscular..."
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAdd()}
                />
                <button className="btn-action btn-primary" style={{ width: 'auto' }} onClick={handleAdd}>+</button>
            </div>

            <div className="list">
                {groups.map(group => (
                    <div key={group.id} className="list-item">
                        {editingId === group.id ? (
                            <div className="flex gap-sm" style={{ flex: 1 }}>
                                <input
                                    type="text"
                                    value={editName}
                                    onChange={e => setEditName(e.target.value)}
                                    autoFocus
                                />
                                <button className="btn-secondary" onClick={() => handleSaveEdit(group.id)}>✓</button>
                                <button className="btn-secondary" onClick={() => setEditingId(null)}>✕</button>
                            </div>
                        ) : (
                            <>
                                <span>{group.name}</span>
                                <div className="flex gap-sm">
                                    <button className="btn-secondary" onClick={() => { setEditingId(group.id); setEditName(group.name) }}>✎</button>
                                    <button className="btn-secondary" style={{ color: 'var(--accent-danger)' }} onClick={() => handleDelete(group.id)}>✕</button>
                                </div>
                            </>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}

// Exercises Tab
function ExercisesTab({ exercises, muscleGroups, onUpdate }: { exercises: Exercise[], muscleGroups: MuscleGroup[], onUpdate: () => void }) {
    const [showForm, setShowForm] = useState(false)
    const [name, setName] = useState('')
    const [selectedGroups, setSelectedGroups] = useState<string[]>([])
    const [editingId, setEditingId] = useState<string | null>(null)

    function resetForm() {
        setName('')
        setSelectedGroups([])
        setEditingId(null)
        setShowForm(false)
    }

    async function handleSave() {
        if (!name.trim() || selectedGroups.length === 0) return
        await db.saveExercise({
            id: editingId || generateId(),
            name: name.trim(),
            muscleGroupIds: selectedGroups
        })
        resetForm()
        onUpdate()
    }

    function startEdit(ex: Exercise) {
        setEditingId(ex.id)
        setName(ex.name)
        setSelectedGroups(ex.muscleGroupIds)
        setShowForm(true)
    }

    async function handleDelete(id: string) {
        await db.deleteExercise(id)
        onUpdate()
    }

    function toggleGroup(id: string) {
        setSelectedGroups(prev =>
            prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]
        )
    }

    function getGroupNames(ids: string[]) {
        return ids.map(id => muscleGroups.find(g => g.id === id)?.name).filter(Boolean).join(', ')
    }

    return (
        <div>
            {!showForm ? (
                <button
                    className="btn-action btn-secondary"
                    style={{ marginBottom: 'var(--spacing-md)' }}
                    onClick={() => setShowForm(true)}
                >
                    + Nuevo Ejercicio
                </button>
            ) : (
                <div className="card" style={{ marginBottom: 'var(--spacing-md)' }}>
                    <input
                        type="text"
                        placeholder="Nombre del ejercicio..."
                        value={name}
                        onChange={e => setName(e.target.value)}
                        style={{ marginBottom: 'var(--spacing-md)' }}
                    />
                    <p className="text-secondary" style={{ marginBottom: 'var(--spacing-sm)', fontSize: '0.875rem' }}>
                        Grupos musculares:
                    </p>
                    <div className="flex gap-sm" style={{ flexWrap: 'wrap', marginBottom: 'var(--spacing-md)' }}>
                        {muscleGroups.map(group => (
                            <button
                                key={group.id}
                                className="btn-secondary"
                                style={{
                                    padding: 'var(--spacing-xs) var(--spacing-sm)',
                                    fontSize: '0.875rem',
                                    background: selectedGroups.includes(group.id) ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                                    color: selectedGroups.includes(group.id) ? 'var(--bg-primary)' : 'var(--text-primary)'
                                }}
                                onClick={() => toggleGroup(group.id)}
                            >
                                {group.name}
                            </button>
                        ))}
                    </div>
                    <div className="flex gap-sm">
                        <button className="btn-action btn-primary" onClick={handleSave}>
                            {editingId ? 'Guardar' : 'Crear'}
                        </button>
                        <button className="btn-action btn-secondary" onClick={resetForm}>Cancelar</button>
                    </div>
                </div>
            )}

            <div className="list">
                {exercises.map(ex => (
                    <div key={ex.id} className="list-item">
                        <div className="list-item-content">
                            <div className="list-item-title">{ex.name}</div>
                            <div className="list-item-subtitle">{getGroupNames(ex.muscleGroupIds)}</div>
                        </div>
                        <div className="flex gap-sm">
                            <button className="btn-secondary" onClick={() => startEdit(ex)}>✎</button>
                            <button className="btn-secondary" style={{ color: 'var(--accent-danger)' }} onClick={() => handleDelete(ex.id)}>✕</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

// Templates Tab
function TemplatesTab({ templates, exercises, onUpdate }: { templates: WorkoutTemplate[], exercises: Exercise[], onUpdate: () => void }) {
    const [showForm, setShowForm] = useState(false)
    const [name, setName] = useState('')
    const [templateExercises, setTemplateExercises] = useState<TemplateExercise[]>([])
    const [editingId, setEditingId] = useState<string | null>(null)

    function resetForm() {
        setName('')
        setTemplateExercises([])
        setEditingId(null)
        setShowForm(false)
    }

    async function handleSave() {
        if (!name.trim() || templateExercises.length === 0) return
        await db.saveTemplate({
            id: editingId || generateId(),
            name: name.trim(),
            exercises: templateExercises
        })
        resetForm()
        onUpdate()
    }

    function startEdit(t: WorkoutTemplate) {
        setEditingId(t.id)
        setName(t.name)
        setTemplateExercises([...t.exercises])
        setShowForm(true)
    }

    async function handleDelete(id: string) {
        await db.deleteTemplate(id)
        onUpdate()
    }

    function addExercise(exId: string) {
        if (templateExercises.some(te => te.exerciseId === exId)) return
        setTemplateExercises(prev => [...prev, {
            exerciseId: exId,
            sets: 3,
            targetReps: 10,
            restSeconds: 90
        }])
    }

    function removeExercise(exId: string) {
        setTemplateExercises(prev => prev.filter(te => te.exerciseId !== exId))
    }

    function updateExercise(exId: string, field: keyof TemplateExercise, value: number) {
        setTemplateExercises(prev => prev.map(te =>
            te.exerciseId === exId ? { ...te, [field]: value } : te
        ))
    }

    function getExerciseName(id: string) {
        return exercises.find(e => e.id === id)?.name || 'Desconocido'
    }

    return (
        <div>
            {!showForm ? (
                <button
                    className="btn-action btn-secondary"
                    style={{ marginBottom: 'var(--spacing-md)' }}
                    onClick={() => setShowForm(true)}
                >
                    + Nuevo Entrenamiento
                </button>
            ) : (
                <div className="card" style={{ marginBottom: 'var(--spacing-md)' }}>
                    <input
                        type="text"
                        placeholder="Nombre del entrenamiento..."
                        value={name}
                        onChange={e => setName(e.target.value)}
                        style={{ marginBottom: 'var(--spacing-md)' }}
                    />

                    <p className="text-secondary" style={{ marginBottom: 'var(--spacing-sm)', fontSize: '0.875rem' }}>
                        Añadir ejercicios:
                    </p>
                    <div className="flex gap-sm" style={{ flexWrap: 'wrap', marginBottom: 'var(--spacing-md)' }}>
                        {exercises.filter(ex => !templateExercises.some(te => te.exerciseId === ex.id)).map(ex => (
                            <button
                                key={ex.id}
                                className="btn-secondary"
                                style={{ padding: 'var(--spacing-xs) var(--spacing-sm)', fontSize: '0.875rem' }}
                                onClick={() => addExercise(ex.id)}
                            >
                                + {ex.name}
                            </button>
                        ))}
                    </div>

                    {templateExercises.length > 0 && (
                        <div className="list" style={{ marginBottom: 'var(--spacing-md)' }}>
                            {templateExercises.map((te, idx) => (
                                <div key={te.exerciseId} className="card" style={{ background: 'var(--bg-tertiary)' }}>
                                    <div className="flex justify-between items-center" style={{ marginBottom: 'var(--spacing-sm)' }}>
                                        <span style={{ fontWeight: 600 }}>{idx + 1}. {getExerciseName(te.exerciseId)}</span>
                                        <button
                                            className="btn-secondary"
                                            style={{ color: 'var(--accent-danger)', padding: 'var(--spacing-xs)' }}
                                            onClick={() => removeExercise(te.exerciseId)}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                    <div className="flex gap-sm">
                                        <div style={{ flex: 1 }}>
                                            <label className="text-muted" style={{ fontSize: '0.75rem' }}>Series</label>
                                            <input
                                                type="number"
                                                value={te.sets}
                                                onChange={e => updateExercise(te.exerciseId, 'sets', parseInt(e.target.value) || 1)}
                                                min={1}
                                            />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <label className="text-muted" style={{ fontSize: '0.75rem' }}>Reps</label>
                                            <input
                                                type="number"
                                                value={te.targetReps}
                                                onChange={e => updateExercise(te.exerciseId, 'targetReps', parseInt(e.target.value) || 1)}
                                                min={1}
                                            />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <label className="text-muted" style={{ fontSize: '0.75rem' }}>Descanso (s)</label>
                                            <input
                                                type="number"
                                                value={te.restSeconds}
                                                onChange={e => updateExercise(te.exerciseId, 'restSeconds', parseInt(e.target.value) || 0)}
                                                min={0}
                                                step={15}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex gap-sm">
                        <button className="btn-action btn-primary" onClick={handleSave}>
                            {editingId ? 'Guardar' : 'Crear'}
                        </button>
                        <button className="btn-action btn-secondary" onClick={resetForm}>Cancelar</button>
                    </div>
                </div>
            )}

            <div className="list">
                {templates.map(t => (
                    <div key={t.id} className="list-item">
                        <div className="list-item-content">
                            <div className="list-item-title">{t.name}</div>
                            <div className="list-item-subtitle">
                                {t.exercises.length} ejercicios · {t.exercises.reduce((sum, e) => sum + e.sets, 0)} series
                            </div>
                        </div>
                        <div className="flex gap-sm">
                            <button className="btn-secondary" onClick={() => startEdit(t)}>✎</button>
                            <button className="btn-secondary" style={{ color: 'var(--accent-danger)' }} onClick={() => handleDelete(t.id)}>✕</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
