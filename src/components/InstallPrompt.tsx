import { useState, useEffect } from 'react'

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
    const [showInstall, setShowInstall] = useState(false)
    const [needsUpdate, setNeedsUpdate] = useState(false)
    const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null)

    useEffect(() => {
        // Listen for install prompt
        const handleBeforeInstall = (e: Event) => {
            e.preventDefault()
            setDeferredPrompt(e as BeforeInstallPromptEvent)
            setShowInstall(true)
        }

        window.addEventListener('beforeinstallprompt', handleBeforeInstall)

        // Check if already installed
        if (window.matchMedia('(display-mode: standalone)').matches) {
            setShowInstall(false)
        }

        // Listen for SW updates
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then((reg) => {
                setRegistration(reg)

                reg.addEventListener('updatefound', () => {
                    const newWorker = reg.installing
                    if (newWorker) {
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                setNeedsUpdate(true)
                            }
                        })
                    }
                })
            })

            // Also check for waiting worker
            navigator.serviceWorker.getRegistration().then((reg) => {
                if (reg?.waiting) {
                    setNeedsUpdate(true)
                    setRegistration(reg)
                }
            })
        }

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
        }
    }, [])

    async function handleInstall() {
        if (!deferredPrompt) return

        await deferredPrompt.prompt()
        const { outcome } = await deferredPrompt.userChoice

        if (outcome === 'accepted') {
            setShowInstall(false)
        }
        setDeferredPrompt(null)
    }

    function handleUpdate() {
        if (registration?.waiting) {
            registration.waiting.postMessage({ type: 'SKIP_WAITING' })
        }
        window.location.reload()
    }

    if (!showInstall && !needsUpdate) return null

    return (
        <div style={{
            position: 'fixed',
            bottom: 'calc(70px + var(--spacing-md))',
            left: 'var(--spacing-md)',
            right: 'var(--spacing-md)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--spacing-sm)',
            zIndex: 1000
        }}>
            {needsUpdate && (
                <button
                    onClick={handleUpdate}
                    style={{
                        width: '100%',
                        padding: 'var(--spacing-md)',
                        background: 'var(--accent-warning)',
                        color: 'var(--bg-primary)',
                        border: 'none',
                        borderRadius: 'var(--radius-md)',
                        fontWeight: 600,
                        fontSize: '0.875rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 'var(--spacing-sm)'
                    }}
                >
                    🔄 Actualizar app
                </button>
            )}

            {showInstall && (
                <button
                    onClick={handleInstall}
                    style={{
                        width: '100%',
                        padding: 'var(--spacing-md)',
                        background: 'var(--accent-primary)',
                        color: 'var(--bg-primary)',
                        border: 'none',
                        borderRadius: 'var(--radius-md)',
                        fontWeight: 600,
                        fontSize: '0.875rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 'var(--spacing-sm)'
                    }}
                >
                    📲 Instalar app
                </button>
            )}
        </div>
    )
}
