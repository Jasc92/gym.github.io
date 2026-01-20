import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db, type WorkoutTemplate, type Session } from '../db'

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function Home() {
    const navigate = useNavigate()
    const [templates, setTemplates] = useState<WorkoutTemplate[]>([])
    const [activeSession, setActiveSession] = useState<Session | null>(null)
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
    const [isInstalled, setIsInstalled] = useState(false)
    const [showIOSInstructions, setShowIOSInstructions] = useState(false)

    useEffect(() => {
        loadData()

        // Check if already installed
        if (window.matchMedia('(display-mode: standalone)').matches) {
            setIsInstalled(true)
        }

        // Listen for install prompt (Chrome/Edge)
        const handleBeforeInstall = (e: Event) => {
            e.preventDefault()
            setDeferredPrompt(e as BeforeInstallPromptEvent)
        }
        window.addEventListener('beforeinstallprompt', handleBeforeInstall)

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
        }
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

    async function handleInstall() {
        if (deferredPrompt) {
            await deferredPrompt.prompt()
            const { outcome } = await deferredPrompt.userChoice
            if (outcome === 'accepted') {
                setIsInstalled(true)
            }
            setDeferredPrompt(null)
        } else {
            // Show iOS instructions
            setShowIOSInstructions(true)
        }
    }

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)

    return (
        <div className="page">
            <header className="page-header">
                <h1 className="page-title">GymTrack</h1>
                <p className="text-secondary">Selecciona un entrenamiento</p>
            </header>

            {/* Install button - always visible if not installed */}
            {!isInstalled && (
                <button
                    className="btn-action"
                    style={{
                        marginBottom: 'var(--spacing-lg)',
                        background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                        color: 'var(--bg-primary)'
                    }}
                    onClick={handleInstall}
                >
                    📲 Instalar App
                </button>
            )}

            {/* iOS Instructions Modal */}
            {showIOSInstructions && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.9)',
                        zIndex: 1000,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 'var(--spacing-lg)'
                    }}
                    onClick={() => setShowIOSInstructions(false)}
                >
                    <div className="card" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ marginBottom: 'var(--spacing-md)' }}>Instalar en {isIOS ? 'iOS' : 'tu dispositivo'}</h3>
                        {isIOS ? (
                            <ol style={{ paddingLeft: 'var(--spacing-lg)', lineHeight: 1.8 }}>
                                <li>Pulsa el botón <strong>Compartir</strong> (📤) en Safari</li>
                                <li>Desplázate y pulsa <strong>"Añadir a pantalla de inicio"</strong></li>
                                <li>Pulsa <strong>"Añadir"</strong></li>
                            </ol>
                        ) : (
                            <ol style={{ paddingLeft: 'var(--spacing-lg)', lineHeight: 1.8 }}>
                                <li>Abre en <strong>Chrome</strong> o <strong>Edge</strong></li>
                                <li>Pulsa el menú (⋮) arriba a la derecha</li>
                                <li>Selecciona <strong>"Instalar aplicación"</strong></li>
                            </ol>
                        )}
                        <button
                            className="btn-action btn-secondary"
                            style={{ marginTop: 'var(--spacing-lg)' }}
                            onClick={() => setShowIOSInstructions(false)}
                        >
                            Entendido
                        </button>
                    </div>
                </div>
            )}

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
