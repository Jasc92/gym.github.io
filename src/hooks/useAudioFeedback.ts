import { useCallback, useRef } from 'react'

export function useAudioFeedback() {
    const audioContextRef = useRef<AudioContext | null>(null)

    const getAudioContext = useCallback(() => {
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
        }
        return audioContextRef.current
    }, [])

    const playBeep = useCallback((frequency = 800, duration = 100) => {
        try {
            const ctx = getAudioContext()
            if (ctx.state === 'suspended') {
                ctx.resume()
            }

            const oscillator = ctx.createOscillator()
            const gainNode = ctx.createGain()

            oscillator.connect(gainNode)
            gainNode.connect(ctx.destination)

            oscillator.type = 'sine'
            oscillator.frequency.setValueAtTime(frequency, ctx.currentTime)

            gainNode.gain.setValueAtTime(0.3, ctx.currentTime)
            gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration / 1000)

            oscillator.start(ctx.currentTime)
            oscillator.stop(ctx.currentTime + duration / 1000)
        } catch (err) {
            console.log('Audio error:', err)
        }
    }, [getAudioContext])

    const playCountdownBeep = useCallback(() => {
        playBeep(600, 100)
    }, [playBeep])

    const playFinalBeep = useCallback(() => {
        // Play two tones for final beep
        playBeep(800, 150)
        setTimeout(() => playBeep(1000, 200), 150)
    }, [playBeep])

    return { playBeep, playCountdownBeep, playFinalBeep }
}
