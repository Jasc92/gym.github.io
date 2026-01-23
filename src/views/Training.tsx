import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db, type WorkoutTemplate, type Session } from '../db'

export default function Training() {
    const navigate = useNavigate()
    const [templates, setTemplates] = useState<WorkoutTemplate[]>([])
    const [activeSession, setActiveSession] = useState<Session | null>(null)

    useEffect(() => {
        loadData()
    }, [])

    async function loadData() {
        const [templatesData, session] = await Promise.all([
            db.getAllTemplates(),
            db.getActiveSession()
        ])
        setTemplates(templatesData)
        setActiveSession(session || null)
    }

    function startWorkout(templateId: string) {
        navigate(`/session/${templateId}`)
    }

    function resumeSession() {
        if (activeSession) {
            navigate(`/session/${activeSession.templateId}`)
        }
    }

    return (
        <div className="page">
            <header className="page-header">
                <h1 className="page-title">Entrenar</h1>
                <p className="text-secondary">Selecciona un entrenamiento</p>
            </header>

            {activeSession && (
                <div className="card" style={{ marginBottom: 'var(--spacing-lg)', borderColor: 'var(--accent-warning)' }}>
                    <p style={{ marginBottom: 'var(--spacing-md)', color: 'var(--accent-warning)' }}>
                        ⚡ Sesión activa: {activeSession.templateName}
                    </p>
                    <button className="btn-action btn-primary" onClick={resumeSession}>
                        Continuar Sesión
                    </button>
                </div>
            )}

            {templates.length === 0 ? (
                <div className="card text-center" style={{ padding: 'var(--spacing-xxl)' }}>
                    <p className="text-secondary" style={{ marginBottom: 'var(--spacing-md)' }}>
                        No tienes entrenamientos creados
                    </p>
                    <button
                        className="btn-action btn-secondary"
                        onClick={() => navigate('/library')}
                    >
                        Ir a Biblioteca
                    </button>
                </div>
            ) : (
                <div className="list">
                    {templates.map(template => (
                        <div key={template.id} className="list-item">
                            <div className="list-item-content">
                                <div className="list-item-title">{template.name}</div>
                                <div className="list-item-subtitle">
                                    {template.exercises.length} ejercicios
                                </div>
                            </div>
                            <button
                                className="btn-action btn-primary"
                                style={{ width: 'auto', padding: 'var(--spacing-sm) var(--spacing-lg)' }}
                                onClick={() => startWorkout(template.id)}
                            >
                                Iniciar
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
