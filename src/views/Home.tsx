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
    const [showInstructions, setShowInstructions] = useState(false)

    useEffect(() => {
        loadData()

        // Check if running as standalone PWA
        if (window.matchMedia('(display-mode: standalone)').matches) {
            setIsInstalled(true)
        }

        // Listen for install prompt (Chrome/Edge)
        const handleBeforeInstall = (e: Event) => {
            e.preventDefault()
            setDeferredPrompt(e as BeforeInstallPromptEvent)
            console.log('Install prompt captured!')
        }
        window.addEventListener('beforeinstallprompt', handleBeforeInstall)

        // Detect when app is actually installed
        const handleInstalled = () => {
            setIsInstalled(true)
            console.log('App installed!')
        }
        window.addEventListener('appinstalled', handleInstalled)

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
            window.removeEventListener('appinstalled', handleInstalled)
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
            try {
                await deferredPrompt.prompt()
                const { outcome } = await deferredPrompt.userChoice
                console.log('Install outcome:', outcome)
                if (outcome === 'accepted') {
                    setIsInstalled(true)
                }
                setDeferredPrompt(null)
            } catch (err) {
                console.error('Install error:', err)
                setShowInstructions(true)
            }
        } else {
            // No prompt available, show manual instructions
            setShowInstructions(true)
        }
    }

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    const isAndroid = /Android/.test(navigator.userAgent)
    const isChrome = /Chrome/.test(navigator.userAgent) && !/Edge|Edg/.test(navigator.userAgent)
    const isEdge = /Edge|Edg/.test(navigator.userAgent)
    const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent)

    function getDeviceInstructions() {
        if (isIOS) {
            return (
                <ol style={{ paddingLeft: 'var(--spacing-lg)', lineHeight: 1.8 }}>
                    <li>Pulsa el botón <strong>Compartir</strong> (📤) abajo en Safari</li>
                    <li>Desplázate y pulsa <strong>"Añadir a pantalla de inicio"</strong></li>
                    <li>Pulsa <strong>"Añadir"</strong></li>
                </ol>
            )
        } else if (isAndroid && isChrome) {
            return (
                <ol style={{ paddingLeft: 'var(--spacing-lg)', lineHeight: 1.8 }}>
                    <li>Pulsa el menú <strong>(⋮)</strong> arriba a la derecha</li>
                    <li>Selecciona <strong>"Añadir a pantalla de inicio"</strong> o <strong>"Instalar aplicación"</strong></li>
                    <li>Confirma pulsando <strong>"Instalar"</strong></li>
                </ol>
            )
        } else if (isChrome || isEdge) {
            return (
                <ol style={{ paddingLeft: 'var(--spacing-lg)', lineHeight: 1.8 }}>
                    <li>Haz clic en el icono de instalación (📥) en la barra de direcciones</li>
                    <li>O pulsa el menú <strong>(⋮)</strong> → <strong>"Instalar GymTrack"</strong></li>
                </ol>
            )
        } else if (isSafari) {
            return (
                <ol style={{ paddingLeft: 'var(--spacing-lg)', lineHeight: 1.8 }}>
                    <li>Safari en macOS: <strong>Archivo → Añadir al Dock</strong></li>
                    <li>O usa <strong>Chrome/Edge</strong> para instalación directa</li>
                </ol>
            )
        } else {
            return (
                <ol style={{ paddingLeft: 'var(--spacing-lg)', lineHeight: 1.8 }}>
                    <li>Abre esta página en <strong>Chrome</strong> o <strong>Edge</strong></li>
                    <li>Busca la opción <strong>"Instalar"</strong> en el menú del navegador</li>
                </ol>
            )
        }
    }

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
                    📲 Instalar App {deferredPrompt ? '' : '(ver instrucciones)'}
                </button>
            )}

            {/* Instructions Modal */}
            {showInstructions && (
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
                    onClick={() => setShowInstructions(false)}
                >
                    <div className="card" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ marginBottom: 'var(--spacing-md)' }}>
                            Instalar GymTrack
                        </h3>

                        {getDeviceInstructions()}

                        <div style={{ marginTop: 'var(--spacing-lg)', display: 'flex', gap: 'var(--spacing-sm)' }}>
                            <button
                                className="btn-action btn-secondary"
                                style={{ flex: 1 }}
                                onClick={() => setShowInstructions(false)}
                            >
                                Cerrar
                            </button>
                            <button
                                className="btn-action btn-primary"
                                style={{ flex: 1 }}
                                onClick={() => setIsInstalled(true)}
                            >
                                Ya instalé
                            </button>
                        </div>
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
