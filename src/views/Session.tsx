import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
    db,
    generateId,
    type WorkoutTemplate,
    type Session as SessionType,
    type Exercise,
    type SetData
} from '../db'

type TimerState = 'IDLE' | 'TUT_ACTIVE' | 'REST' | 'SET_COMPLETE'

export default function Session() {
    const { templateId } = useParams<{ templateId: string }>()
    const navigate = useNavigate()

    const [template, setTemplate] = useState<WorkoutTemplate | null>(null)
    const [exercises, setExercises] = useState<Exercise[]>([])
    const [session, setSession] = useState<SessionType | null>(null)

    const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0)
    const [currentSetIndex, setCurrentSetIndex] = useState(0)
    const [timerState, setTimerState] = useState<TimerState>('IDLE')

    const [tutStartTime, setTutStartTime] = useState<number | null>(null)
    const [restStartTime, setRestStartTime] = useState<number | null>(null)
    const [elapsedTut, setElapsedTut] = useState(0)
    const [elapsedRest, setElapsedRest] = useState(0)
    const [lastTutTime, setLastTutTime] = useState(0) // Store last TUT for display

    const [weight, setWeight] = useState(0)
    const [reps, setReps] = useState(0)
    const [rpe, setRpe] = useState(7)
    const [technicalFailure, setTechnicalFailure] = useState(false)

    const [sessionStartTime, setSessionStartTime] = useState<number>(Date.now())
    const [sessionElapsed, setSessionElapsed] = useState(0)

    const wakeLockRef = useRef<WakeLockSentinel | null>(null)
    const timerRef = useRef<number | null>(null)

    // Load template and initialize/resume session
    useEffect(() => {
        async function init() {
            if (!templateId) return

            const [templateData, allExercises, existingSession] = await Promise.all([
                db.getTemplate(templateId),
                db.getAllExercises(),
                db.getActiveSession()
            ])

            if (!templateData) {
                navigate('/')
                return
            }

            setTemplate(templateData)
            setExercises(allExercises)

            // Check for existing active session
            if (existingSession && existingSession.templateId === templateId) {
                // Resume session
                setSession(existingSession)
                setSessionStartTime(existingSession.startTime)
                restoreSessionState(existingSession, templateData)
            } else {
                // Create new session
                const newSession: SessionType = {
                    id: generateId(),
                    templateId,
                    templateName: templateData.name,
                    startTime: Date.now(),
                    exercises: templateData.exercises.map(te => ({
                        exerciseId: te.exerciseId,
                        sets: []
                    })),
                    completed: false
                }
                await db.saveSession(newSession)
                setSession(newSession)
                setSessionStartTime(newSession.startTime)
            }

            // Request wake lock
            requestWakeLock()
        }

        init()

        return () => {
            releaseWakeLock()
            if (timerRef.current) clearInterval(timerRef.current)
        }
    }, [templateId, navigate])

    // Re-acquire wake lock when page becomes visible again
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && !wakeLockRef.current) {
                requestWakeLock()
            }
        }

        document.addEventListener('visibilitychange', handleVisibilityChange)
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
    }, [])

    // Restore session state from saved data
    function restoreSessionState(savedSession: SessionType, templateData: WorkoutTemplate) {
        // Find current exercise (first one without all sets completed)
        for (let i = 0; i < templateData.exercises.length; i++) {
            const templateEx = templateData.exercises[i]
            const sessionEx = savedSession.exercises[i]

            if (sessionEx.sets.length < templateEx.sets) {
                setCurrentExerciseIndex(i)
                setCurrentSetIndex(sessionEx.sets.length)

                // Pre-fill from last set if exists
                if (sessionEx.sets.length > 0) {
                    const lastSet = sessionEx.sets[sessionEx.sets.length - 1]
                    setWeight(lastSet.weight)
                    setReps(lastSet.reps)
                    setLastTutTime(lastSet.tutMs)
                }
                return
            }
        }

        // All exercises done
        setCurrentExerciseIndex(templateData.exercises.length - 1)
        setCurrentSetIndex(templateData.exercises[templateData.exercises.length - 1].sets)
    }

    // Timer tick
    useEffect(() => {
        timerRef.current = window.setInterval(() => {
            const now = Date.now()

            // Session elapsed
            setSessionElapsed(now - sessionStartTime)

            // TUT timer
            if (tutStartTime) {
                setElapsedTut(now - tutStartTime)
            }

            // Rest timer
            if (restStartTime) {
                setElapsedRest(now - restStartTime)
            }
        }, 100)

        return () => {
            if (timerRef.current) clearInterval(timerRef.current)
        }
    }, [tutStartTime, restStartTime, sessionStartTime])

    // Check rest complete
    useEffect(() => {
        if (timerState !== 'REST' || !template) return

        const targetRest = template.exercises[currentExerciseIndex]?.restSeconds || 90
        const restMs = targetRest * 1000

        if (elapsedRest >= restMs) {
            // Vibrate
            if ('vibrate' in navigator) {
                navigator.vibrate([200, 100, 200])
            }
            setTimerState('SET_COMPLETE')
        }
    }, [elapsedRest, timerState, template, currentExerciseIndex])

    async function requestWakeLock() {
        try {
            if ('wakeLock' in navigator) {
                wakeLockRef.current = await navigator.wakeLock.request('screen')
                console.log('Wake Lock acquired')
            }
        } catch (err) {
            console.log('Wake Lock error:', err)
        }
    }

    function releaseWakeLock() {
        if (wakeLockRef.current) {
            wakeLockRef.current.release()
            wakeLockRef.current = null
        }
    }

    // Timer actions
    function startTut() {
        setTutStartTime(Date.now())
        setElapsedTut(0)
        setTimerState('TUT_ACTIVE')
    }

    function endTut() {
        setLastTutTime(elapsedTut) // Store TUT for display
        setTutStartTime(null)
        setRestStartTime(Date.now())
        setElapsedRest(0)
        setTimerState('REST')

        // Pre-fill reps from template
        if (template) {
            setReps(template.exercises[currentExerciseIndex].targetReps)
        }
    }

    const saveSet = useCallback(async () => {
        if (!session || !template) return

        const setData: SetData = {
            setNumber: currentSetIndex + 1,
            weight,
            reps,
            rpe,
            technicalFailure,
            tutMs: lastTutTime,
            restMs: elapsedRest,
            startTime: tutStartTime || Date.now(),
            endTime: Date.now()
        }

        const updatedSession = { ...session }
        updatedSession.exercises[currentExerciseIndex].sets.push(setData)

        await db.saveSession(updatedSession)
        setSession(updatedSession)

        // Move to next set or exercise
        const templateEx = template.exercises[currentExerciseIndex]

        if (currentSetIndex + 1 >= templateEx.sets) {
            // Move to next exercise
            if (currentExerciseIndex + 1 >= template.exercises.length) {
                // Workout complete!
                await finishWorkout(updatedSession)
                return
            }
            setCurrentExerciseIndex(prev => prev + 1)
            setCurrentSetIndex(0)
        } else {
            setCurrentSetIndex(prev => prev + 1)
        }

        // Reset for next set
        setRestStartTime(null)
        setElapsedRest(0)
        setElapsedTut(0)
        setLastTutTime(0)
        setTechnicalFailure(false)
        setTimerState('IDLE')
    }, [session, template, currentExerciseIndex, currentSetIndex, weight, reps, rpe, technicalFailure, lastTutTime, elapsedRest, tutStartTime])

    async function finishWorkout(finalSession: SessionType) {
        const completed = {
            ...finalSession,
            completed: true,
            endTime: Date.now()
        }
        await db.saveSession(completed)
        releaseWakeLock()

        // Show summary (for now just navigate home)
        navigate('/')
    }

    async function cancelWorkout() {
        if (session) {
            await db.deleteSession(session.id)
        }
        releaseWakeLock()
        navigate('/')
    }

    // Helpers
    function formatTime(ms: number) {
        const totalSeconds = Math.floor(ms / 1000)
        const mins = Math.floor(totalSeconds / 60)
        const secs = totalSeconds % 60
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }

    function getLastSetData(): SetData | null {
        if (!session) return null
        const currentExSets = session.exercises[currentExerciseIndex]?.sets
        if (currentExSets && currentExSets.length > 0) {
            return currentExSets[currentExSets.length - 1]
        }
        return null
    }

    if (!template || !session) {
        return (
            <div className="page flex items-center justify-center">
                <div className="pulse">Cargando...</div>
            </div>
        )
    }

    const currentTemplateEx = template.exercises[currentExerciseIndex]
    const currentExercise = exercises.find(e => e.id === currentTemplateEx?.exerciseId)
    const lastSet = getLastSetData()
    const isRestComplete = timerState === 'SET_COMPLETE' ||
        (timerState === 'REST' && elapsedRest >= (currentTemplateEx?.restSeconds || 90) * 1000)

    return (
        <div
            className={`page ${isRestComplete ? 'flash' : ''}`}
            style={{
                paddingBottom: 'var(--spacing-md)',
                background: timerState === 'TUT_ACTIVE' ? 'var(--bg-secondary)' : 'var(--bg-primary)'
            }}
        >
            {/* Header */}
            <header style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 'var(--spacing-lg)'
            }}>
                <div>
                    <p className="text-muted" style={{ fontSize: '0.75rem' }}>Sesión</p>
                    <p className="timer-label" style={{ textAlign: 'left', marginBottom: 0 }}>
                        {formatTime(sessionElapsed)}
                    </p>
                </div>
                <button
                    className="btn-secondary"
                    style={{ padding: 'var(--spacing-sm)', color: 'var(--accent-danger)' }}
                    onClick={cancelWorkout}
                >
                    Cancelar
                </button>
            </header>

            {/* Current Exercise */}
            <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
                <p className="text-muted" style={{ fontSize: '0.75rem', marginBottom: 'var(--spacing-xs)' }}>
                    Ejercicio {currentExerciseIndex + 1} de {template.exercises.length}
                </p>
                <h2 style={{ fontSize: '1.5rem', marginBottom: 'var(--spacing-xs)' }}>
                    {currentExercise?.name}
                </h2>
                <p style={{ color: 'var(--accent-primary)' }}>
                    Serie {currentSetIndex + 1} de {currentTemplateEx.sets}
                </p>
            </div>

            {/* Last Set Reference */}
            {lastSet && (
                <div className="card" style={{
                    marginBottom: 'var(--spacing-lg)',
                    background: 'var(--bg-tertiary)',
                    padding: 'var(--spacing-sm) var(--spacing-md)'
                }}>
                    <p className="text-muted" style={{ fontSize: '0.75rem' }}>Serie anterior:</p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{lastSet.weight}kg × {lastSet.reps} reps · RPE {lastSet.rpe}</span>
                        <span className="text-secondary" style={{ fontSize: '0.75rem' }}>
                            TUT: {formatTime(lastSet.tutMs)} · Desc: {formatTime(lastSet.restMs)}
                        </span>
                    </div>
                </div>
            )}

            {/* Timer Display */}
            <div style={{ marginBottom: 'var(--spacing-xl)' }}>
                {timerState === 'IDLE' && (
                    <div className="text-center">
                        <p className="timer-label">Listo para empezar</p>
                        <p className="timer-display" style={{ color: 'var(--text-muted)' }}>00:00</p>
                    </div>
                )}

                {timerState === 'TUT_ACTIVE' && (
                    <div className="text-center">
                        <p className="timer-label" style={{ color: 'var(--accent-warning)' }}>⏱️ Tiempo bajo tensión</p>
                        <p className="timer-display" style={{ color: 'var(--accent-warning)' }}>
                            {formatTime(elapsedTut)}
                        </p>
                    </div>
                )}

                {(timerState === 'REST' || timerState === 'SET_COMPLETE') && (
                    <div className="text-center">
                        <p className="timer-label" style={{ color: isRestComplete ? 'var(--accent-primary)' : 'var(--accent-rest)' }}>
                            {isRestComplete ? '✅ ¡Listo para siguiente serie!' : '😮‍💨 Descansando...'}
                        </p>
                        <p className="timer-display" style={{
                            color: isRestComplete ? 'var(--accent-primary)' : 'var(--accent-rest)',
                            fontSize: '5rem'
                        }}>
                            {formatTime(elapsedRest)}
                        </p>

                        {/* Rest progress bar */}
                        <div style={{
                            width: '100%',
                            height: '8px',
                            background: 'var(--bg-tertiary)',
                            borderRadius: 'var(--radius-full)',
                            marginTop: 'var(--spacing-md)',
                            overflow: 'hidden'
                        }}>
                            <div style={{
                                width: `${Math.min(100, (elapsedRest / ((currentTemplateEx?.restSeconds || 90) * 1000)) * 100)}%`,
                                height: '100%',
                                background: isRestComplete ? 'var(--accent-primary)' : 'var(--accent-rest)',
                                transition: 'width 0.1s linear'
                            }} />
                        </div>

                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginTop: 'var(--spacing-sm)',
                            fontSize: '0.875rem'
                        }}>
                            <span className="text-muted">TUT: {formatTime(lastTutTime)}</span>
                            <span className="text-muted">Obj: {currentTemplateEx.restSeconds}s</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Data Input (during REST) */}
            {(timerState === 'REST' || timerState === 'SET_COMPLETE') && (
                <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
                    <div className="flex gap-md" style={{ marginBottom: 'var(--spacing-md)' }}>
                        <div style={{ flex: 1 }}>
                            <label className="text-muted" style={{ fontSize: '0.75rem', display: 'block', marginBottom: 'var(--spacing-xs)' }}>
                                Peso (kg)
                            </label>
                            <input
                                type="number"
                                value={weight}
                                onChange={e => setWeight(parseFloat(e.target.value) || 0)}
                                step={2.5}
                                style={{ fontSize: '1.25rem', textAlign: 'center' }}
                            />
                        </div>
                        <div style={{ flex: 1 }}>
                            <label className="text-muted" style={{ fontSize: '0.75rem', display: 'block', marginBottom: 'var(--spacing-xs)' }}>
                                Repeticiones
                            </label>
                            <input
                                type="number"
                                value={reps}
                                onChange={e => setReps(parseInt(e.target.value) || 0)}
                                style={{ fontSize: '1.25rem', textAlign: 'center' }}
                            />
                        </div>
                    </div>

                    <div style={{ marginBottom: 'var(--spacing-md)' }}>
                        <label className="text-muted" style={{ fontSize: '0.75rem', display: 'block', marginBottom: 'var(--spacing-sm)' }}>
                            RPE (Esfuerzo Percibido): {rpe}
                        </label>
                        <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
                            {[5, 6, 7, 8, 9, 10].map(val => (
                                <button
                                    key={val}
                                    className="btn-secondary"
                                    style={{
                                        flex: 1,
                                        minWidth: '40px',
                                        background: rpe === val ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                                        color: rpe === val ? 'var(--bg-primary)' : 'var(--text-primary)'
                                    }}
                                    onClick={() => setRpe(val)}
                                >
                                    {val}
                                </button>
                            ))}
                        </div>
                    </div>

                    <label className="flex items-center gap-sm" style={{ cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={technicalFailure}
                            onChange={e => setTechnicalFailure(e.target.checked)}
                            style={{ width: '20px', height: '20px' }}
                        />
                        <span>Fallo técnico</span>
                    </label>
                </div>
            )}

            {/* Action Buttons */}
            <div style={{ marginTop: 'auto' }}>
                {timerState === 'IDLE' && (
                    <button className="btn-action btn-primary" onClick={startTut}>
                        🏋️ Iniciar Serie
                    </button>
                )}

                {timerState === 'TUT_ACTIVE' && (
                    <button className="btn-action btn-danger" onClick={endTut}>
                        ⏹️ Fin de Serie
                    </button>
                )}

                {(timerState === 'REST' || timerState === 'SET_COMPLETE') && (
                    <button
                        className={`btn-action ${isRestComplete ? 'btn-primary' : 'btn-rest'}`}
                        onClick={saveSet}
                    >
                        ➡️ Siguiente Serie
                    </button>
                )}
            </div>
        </div>
    )
}
