import { useEffect, useState } from 'react'
import { db, type Session } from '../db'

export default function History() {
    const [sessions, setSessions] = useState<Session[]>([])

    useEffect(() => {
        loadSessions()
    }, [])

    async function loadSessions() {
        const allSessions = await db.getAllSessions()
        // Only show completed sessions, sorted by date descending
        const completed = allSessions
            .filter(s => s.completed)
            .sort((a, b) => b.startTime - a.startTime)
        setSessions(completed)
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

    return (
        <div className="page">
            <header className="page-header">
                <h1 className="page-title">Historial</h1>
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
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
