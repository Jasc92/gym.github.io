import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function Home() {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
    const [hideInstall, setHideInstall] = useState(() => {
        return localStorage.getItem('gymtrack_hide_install') === 'true'
    })
    const [showInstructions, setShowInstructions] = useState(false)
    const [updateAvailable, setUpdateAvailable] = useState(false)
    const [isChecking, setIsChecking] = useState(false)

    useEffect(() => {
        const handleBeforeInstall = (e: Event) => {
            e.preventDefault()
            setDeferredPrompt(e as BeforeInstallPromptEvent)
        }
        window.addEventListener('beforeinstallprompt', handleBeforeInstall)

        const handleInstalled = () => {
            setHideInstall(true)
            localStorage.setItem('gymtrack_hide_install', 'true')
        }
        window.addEventListener('appinstalled', handleInstalled)

        // Check for service worker updates
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then(registration => {
                registration.addEventListener('updatefound', () => {
                    setUpdateAvailable(true)
                })
            })
        }

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
            window.removeEventListener('appinstalled', handleInstalled)
        }
    }, [])

    async function handleInstall() {
        if (deferredPrompt) {
            try {
                await deferredPrompt.prompt()
                const { outcome } = await deferredPrompt.userChoice
                if (outcome === 'accepted') {
                    setHideInstall(true)
                    localStorage.setItem('gymtrack_hide_install', 'true')
                }
                setDeferredPrompt(null)
            } catch {
                setShowInstructions(true)
            }
        } else {
            setShowInstructions(true)
        }
    }

    async function checkForUpdates() {
        setIsChecking(true)
        try {
            if ('serviceWorker' in navigator) {
                const registration = await navigator.serviceWorker.ready
                await registration.update()

                if (registration.waiting) {
                    setUpdateAvailable(true)
                } else {
                    // No update found
                    if ('vibrate' in navigator) {
                        navigator.vibrate(100)
                    }
                }
            }
        } catch (err) {
            console.log('Update check failed:', err)
        }
        setIsChecking(false)
    }

    function applyUpdate() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then(registration => {
                if (registration.waiting) {
                    registration.waiting.postMessage({ type: 'SKIP_WAITING' })
                    window.location.reload()
                }
            })
        }
    }

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    const isAndroid = /Android/.test(navigator.userAgent)
    const isChrome = /Chrome/.test(navigator.userAgent) && !/Edge|Edg/.test(navigator.userAgent)

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
                    <li>Selecciona <strong>"Instalar aplicación"</strong></li>
                    <li>Confirma pulsando <strong>"Instalar"</strong></li>
                </ol>
            )
        } else {
            return (
                <ol style={{ paddingLeft: 'var(--spacing-lg)', lineHeight: 1.8 }}>
                    <li>Busca la opción <strong>"Instalar"</strong> en el menú del navegador</li>
                </ol>
            )
        }
    }

    return (
        <div className="page">
            {/* Hero Section */}
            <div style={{
                textAlign: 'center',
                padding: 'var(--spacing-xl) 0',
                marginBottom: 'var(--spacing-lg)'
            }}>
                <h1 style={{
                    fontSize: '2.5rem',
                    fontWeight: 800,
                    background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-rest))',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    marginBottom: 'var(--spacing-xs)'
                }}>
                    GymTrack
                </h1>
                <p className="text-muted" style={{ fontSize: '0.875rem' }}>
                    Registro biométrico de entrenamientos
                </p>
            </div>

            {/* Update Section */}
            <div className="card" style={{ marginBottom: 'var(--spacing-md)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-sm)' }}>
                    <span style={{ fontWeight: 600 }}>Actualizaciones</span>
                    {updateAvailable && (
                        <span style={{
                            background: 'var(--accent-primary)',
                            color: 'var(--bg-primary)',
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-full)',
                            fontSize: '0.7rem',
                            fontWeight: 600
                        }}>
                            ¡Disponible!
                        </span>
                    )}
                </div>

                {updateAvailable ? (
                    <button className="btn-action btn-primary" onClick={applyUpdate}>
                        🔄 Aplicar Actualización
                    </button>
                ) : (
                    <button
                        className="btn-action btn-secondary"
                        onClick={checkForUpdates}
                        disabled={isChecking}
                    >
                        {isChecking ? '⏳ Comprobando...' : '🔍 Revisar Actualizaciones'}
                    </button>
                )}
            </div>

            {/* Install Section */}
            {!hideInstall && (
                <div className="card" style={{ marginBottom: 'var(--spacing-md)' }}>
                    <p style={{ fontWeight: 600, marginBottom: 'var(--spacing-sm)' }}>Instalar App</p>
                    <p className="text-muted" style={{ fontSize: '0.8rem', marginBottom: 'var(--spacing-sm)' }}>
                        Añade GymTrack a tu pantalla de inicio para acceso rápido
                    </p>
                    <button
                        className="btn-action btn-primary"
                        onClick={handleInstall}
                    >
                        📲 Instalar
                    </button>
                </div>
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
                                onClick={() => {
                                    setHideInstall(true)
                                    localStorage.setItem('gymtrack_hide_install', 'true')
                                    setShowInstructions(false)
                                }}
                            >
                                Ya instalé
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Version Info */}
            <p className="text-muted text-center" style={{ fontSize: '0.7rem', marginTop: 'var(--spacing-lg)' }}>
                v1.0.0
            </p>
        </div>
    )
}
