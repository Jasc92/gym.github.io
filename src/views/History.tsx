import { useEffect, useState } from 'react'
import { db, type Session, type Exercise } from '../db'
import Modal from '../components/Modal'

export default function History() {
    const [sessions, setSessions] = useState<Session[]>([])
    const [exercises, setExercises] = useState<Exercise[]>([])
    const [showExportModal, setShowExportModal] = useState(false)
    const [selectedSession, setSelectedSession] = useState<Session | null>(null)
    const [exportAll, setExportAll] = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [sessionToDelete, setSessionToDelete] = useState<Session | null>(null)

    useEffect(() => {
        loadData()
    }, [])

    async function loadData() {
        const [allSessions, allExercises] = await Promise.all([
            db.getAllSessions(),
            db.getAllExercises()
        ])
        const completed = allSessions
            .filter(s => s.completed)
            .sort((a, b) => b.startTime - a.startTime)
        setSessions(completed)
        setExercises(allExercises)
    }

    function formatDate(timestamp: number) {
        return new Date(timestamp).toLocaleDateString('es-ES', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        })
    }

    function formatDuration(start: number, end?: number) {
        if (!end) return '--'
        const mins = Math.floor((end - start) / 60000)
        return `${mins} min`
    }

    function getTotalSets(session: Session) {
        return session.exercises.reduce((sum, ex) => sum + ex.sets.length, 0)
    }

    function getExerciseName(exerciseId: string): string {
        return exercises.find(e => e.id === exerciseId)?.name || exerciseId
    }

    function formatSessionForAI(session: Session): object {
        return {
            workout: session.templateName,
            date: new Date(session.startTime).toISOString().split('T')[0],
            duration_minutes: session.endTime ? Math.round((session.endTime - session.startTime) / 60000) : 0,
            exercises: session.exercises.map(ex => ({
                name: getExerciseName(ex.exerciseId),
                sets: ex.sets.map(s => ({
                    weight_kg: s.weight,
                    reps: s.reps,
                    rpe: s.rpe,
                    tut_seconds: Math.round(s.tutMs / 1000),
                    rest_seconds: Math.round(s.restMs / 1000),
                    technical_failure: s.technicalFailure
                }))
            }))
        }
    }

    function generateExportJSON(): string {
        if (exportAll) {
            const data = sessions.map(formatSessionForAI)
            return JSON.stringify(data, null, 2)
        } else if (selectedSession) {
            return JSON.stringify(formatSessionForAI(selectedSession), null, 2)
        }
        return ''
    }

    async function copyToClipboard() {
        await navigator.clipboard.writeText(generateExportJSON())
        if ('vibrate' in navigator) {
            navigator.vibrate(100)
        }
    }

    function openExportModal(session: Session | null, all: boolean) {
        setSelectedSession(session)
        setExportAll(all)
        setShowExportModal(true)
    }

    function confirmDelete(session: Session) {
        setSessionToDelete(session)
        setShowDeleteConfirm(true)
    }

    async function deleteSession() {
        if (!sessionToDelete) return
        await db.deleteSession(sessionToDelete.id)
        setShowDeleteConfirm(false)
        setSessionToDelete(null)
        await loadData()
    }

    return (
        <div className="page">
            <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1 className="page-title">Historial</h1>
                {sessions.length > 0 && (
                    <button
                        className="btn-secondary"
                        style={{ padding: 'var(--spacing-sm) var(--spacing-md)', fontSize: '0.875rem' }}
                        onClick={() => openExportModal(null, true)}
                    >
                        📋 Exportar todo
                    </button>
                )}
            </header>

            {sessions.length === 0 ? (
                <div className="card text-center" style={{ padding: 'var(--spacing-xxl)' }}>
                    <p className="text-secondary">No hay sesiones completadas</p>
                </div>
            ) : (
                <div className="list">
                    {sessions.map(session => (
                        <div key={session.id} className="list-item">
                            <div className="list-item-content">
                                <div className="list-item-title">{session.templateName}</div>
                                <div className="list-item-subtitle">
                                    {formatDate(session.startTime)} · {formatDuration(session.startTime, session.endTime)} · {getTotalSets(session)} series
                                </div>
                            </div>
                            <div className="flex gap-sm">
                                <button
                                    className="btn-secondary"
                                    style={{ padding: 'var(--spacing-sm)', fontSize: '0.875rem' }}
                                    onClick={() => openExportModal(session, false)}
                                >
                                    📋
                                </button>
                                <button
                                    className="btn-secondary"
                                    style={{ padding: 'var(--spacing-sm)', fontSize: '0.875rem', color: 'var(--accent-danger)' }}
                                    onClick={() => confirmDelete(session)}
                                >
                                    🗑️
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Export Modal */}
            <Modal
                isOpen={showExportModal}
                onClose={() => setShowExportModal(false)}
                title={exportAll ? 'Exportar Todas las Sesiones' : `Exportar: ${selectedSession?.templateName || ''}`}
            >
                <div>
                    {selectedSession && !exportAll && (
                        <div className="card" style={{ marginBottom: 'var(--spacing-md)' }}>
                            <div className="summary-stat">
                                <span className="summary-stat-label">Fecha</span>
                                <span className="summary-stat-value">{formatDate(selectedSession.startTime)}</span>
                            </div>
                            <div className="summary-stat">
                                <span className="summary-stat-label">Duración</span>
                                <span className="summary-stat-value">
                                    {formatDuration(selectedSession.startTime, selectedSession.endTime)}
                                </span>
                            </div>
                            <div className="summary-stat">
                                <span className="summary-stat-label">Series</span>
                                <span className="summary-stat-value">{getTotalSets(selectedSession)}</span>
                            </div>
                        </div>
                    )}

                    {exportAll && (
                        <p className="text-muted" style={{ fontSize: '0.875rem', marginBottom: 'var(--spacing-sm)' }}>
                            {sessions.length} sesiones en total
                        </p>
                    )}

                    <p className="text-muted" style={{ fontSize: '0.75rem', marginBottom: 'var(--spacing-sm)' }}>
                        JSON optimizado para análisis por IA:
                    </p>
                    <textarea
                        readOnly
                        value={generateExportJSON()}
                        style={{ marginBottom: 'var(--spacing-md)' }}
                    />

                    <button className="btn-action btn-primary" onClick={copyToClipboard}>
                        📋 Copiar al Portapapeles
                    </button>
                </div>
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                title="🗑️ Eliminar Sesión"
            >
                <div>
                    <p style={{ marginBottom: 'var(--spacing-md)' }}>
                        ¿Seguro que quieres eliminar esta sesión?
                    </p>
                    {sessionToDelete && (
                        <div className="card" style={{ marginBottom: 'var(--spacing-md)', background: 'var(--bg-tertiary)' }}>
                            <p style={{ fontWeight: 600 }}>{sessionToDelete.templateName}</p>
                            <p className="text-muted" style={{ fontSize: '0.8rem' }}>
                                {formatDate(sessionToDelete.startTime)}
                            </p>
                        </div>
                    )}
                    <p className="text-muted" style={{ fontSize: '0.8rem', marginBottom: 'var(--spacing-md)', color: 'var(--accent-danger)' }}>
                        Esta acción no se puede deshacer.
                    </p>
                    <div className="flex gap-sm">
                        <button
                            className="btn-action btn-secondary"
                            onClick={() => setShowDeleteConfirm(false)}
                        >
                            Cancelar
                        </button>
                        <button
                            className="btn-action btn-danger"
                            onClick={deleteSession}
                        >
                            Eliminar
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    )
}

