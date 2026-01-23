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
import { useAudioFeedback } from '../hooks/useAudioFeedback'
import Modal from '../components/Modal'
import ScrollPicker from '../components/ScrollPicker'

// States:
// IDLE - Ready to start a set (shows "Iniciar Serie")
// PREPARATION - 5s countdown before TUT
// EXECUTION - TUT timer running (shows "Fin de Serie")
// REST - Rest timer + data form (shows "Registrar Serie" + after registering "Iniciar Serie")
// TRANSITION - Inter-exercise rest (shows "Siguiente Ejercicio")
type TimerState = 'IDLE' | 'PREPARATION' | 'EXECUTION' | 'REST' | 'TRANSITION'

const COUNTDOWN_SECONDS = 5
const TIMER_STORAGE_KEY = 'gymtrack_timer_state'

interface TimerPersistence {
    sessionId: string
    state: TimerState
    tutStartTime: number | null
    restStartTime: number | null
    countdownEndTime: number | null
    lastTutMs: number
    setRegistered: boolean
}

export default function Session() {
    const { templateId } = useParams<{ templateId: string }>()
    const navigate = useNavigate()
    const { playCountdownBeep, playFinalBeep } = useAudioFeedback()

    const [template, setTemplate] = useState<WorkoutTemplate | null>(null)
    const [exercises, setExercises] = useState<Exercise[]>([])
    const [session, setSession] = useState<SessionType | null>(null)

    const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0)
    const [currentSetIndex, setCurrentSetIndex] = useState(0)
    const [timerState, setTimerState] = useState<TimerState>('IDLE')
    const [previousExerciseIndex, setPreviousExerciseIndex] = useState<number | null>(null)

    const [tutStartTime, setTutStartTime] = useState<number | null>(null)
    const [restStartTime, setRestStartTime] = useState<number | null>(null)
    const [countdownEndTime, setCountdownEndTime] = useState<number | null>(null)
    const [elapsedTut, setElapsedTut] = useState(0)
    const [elapsedRest, setElapsedRest] = useState(0)
    const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS)
    const [lastTutTime, setLastTutTime] = useState(0)

    const [weight, setWeight] = useState<number | string>('')
    const [reps, setReps] = useState(10)
    const [rpe, setRpe] = useState(7)
    const [technicalFailure, setTechnicalFailure] = useState(false)

    const [sessionStartTime, setSessionStartTime] = useState<number>(Date.now())
    const [sessionElapsed, setSessionElapsed] = useState(0)

    const [showSummaryModal, setShowSummaryModal] = useState(false)
    const [summaryData, setSummaryData] = useState<SessionType | null>(null)

    // Track if current set data has been registered
    const [setRegistered, setSetRegistered] = useState(false)

    const wakeLockRef = useRef<WakeLockSentinel | null>(null)
    const timerRef = useRef<number | null>(null)
    const lastCountdownSecondRef = useRef<number>(COUNTDOWN_SECONDS)
    const hasVibratedRef = useRef(false)

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

            if (existingSession && existingSession.templateId === templateId) {
                setSession(existingSession)
                setSessionStartTime(existingSession.startTime)
                restoreSessionState(existingSession, templateData)
                restoreTimerState(existingSession.id)
            } else {
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

            requestWakeLock()
        }

        init()

        return () => {
            releaseWakeLock()
            if (timerRef.current) clearInterval(timerRef.current)
        }
    }, [templateId, navigate])

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && !wakeLockRef.current) {
                requestWakeLock()
            }
        }

        document.addEventListener('visibilitychange', handleVisibilityChange)
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
    }, [])

    const saveTimerState = useCallback(() => {
        if (!session) return
        const state: TimerPersistence = {
            sessionId: session.id,
            state: timerState,
            tutStartTime,
            restStartTime,
            countdownEndTime,
            lastTutMs: lastTutTime,
            setRegistered
        }
        localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(state))
    }, [session, timerState, tutStartTime, restStartTime, countdownEndTime, lastTutTime, setRegistered])

    useEffect(() => {
        saveTimerState()
    }, [saveTimerState])

    function restoreTimerState(sessionId: string) {
        try {
            const stored = localStorage.getItem(TIMER_STORAGE_KEY)
            if (!stored) return

            const state: TimerPersistence = JSON.parse(stored)
            if (state.sessionId !== sessionId) return

            const now = Date.now()

            if (state.state === 'PREPARATION' && state.countdownEndTime) {
                if (state.countdownEndTime > now) {
                    setCountdownEndTime(state.countdownEndTime)
                    setTimerState('PREPARATION')
                } else {
                    setTutStartTime(state.countdownEndTime)
                    setTimerState('EXECUTION')
                }
            } else if (state.state === 'EXECUTION' && state.tutStartTime) {
                setTutStartTime(state.tutStartTime)
                setTimerState('EXECUTION')
            } else if ((state.state === 'REST' || state.state === 'TRANSITION') && state.restStartTime) {
                setRestStartTime(state.restStartTime)
                setLastTutTime(state.lastTutMs)
                setSetRegistered(state.setRegistered || false)
                setTimerState(state.state)
            }
        } catch (e) {
            console.log('Failed to restore timer state:', e)
        }
    }

    function restoreSessionState(savedSession: SessionType, templateData: WorkoutTemplate) {
        for (let i = 0; i < templateData.exercises.length; i++) {
            const templateEx = templateData.exercises[i]
            const sessionEx = savedSession.exercises[i]

            if (sessionEx.sets.length < templateEx.sets) {
                setCurrentExerciseIndex(i)
                setCurrentSetIndex(sessionEx.sets.length)

                if (sessionEx.sets.length > 0) {
                    const lastSet = sessionEx.sets[sessionEx.sets.length - 1]
                    setWeight(lastSet.weight)
                    setReps(lastSet.reps)
                    setLastTutTime(lastSet.tutMs)
                }
                return
            }
        }

        setCurrentExerciseIndex(templateData.exercises.length - 1)
        setCurrentSetIndex(templateData.exercises[templateData.exercises.length - 1].sets)
    }

    // Reset weight/RPE when changing exercises
    useEffect(() => {
        if (previousExerciseIndex !== null && previousExerciseIndex !== currentExerciseIndex) {
            setWeight('')
            setRpe(7)
        }
        setPreviousExerciseIndex(currentExerciseIndex)
    }, [currentExerciseIndex, previousExerciseIndex])

    // Timer tick
    useEffect(() => {
        timerRef.current = window.setInterval(() => {
            const now = Date.now()

            setSessionElapsed(now - sessionStartTime)

            if (countdownEndTime) {
                const remaining = Math.ceil((countdownEndTime - now) / 1000)
                setCountdown(Math.max(0, remaining))

                if (remaining !== lastCountdownSecondRef.current && remaining > 0) {
                    lastCountdownSecondRef.current = remaining
                    playCountdownBeep()
                }

                if (remaining <= 0 && timerState === 'PREPARATION') {
                    playFinalBeep()
                    setCountdownEndTime(null)
                    setTutStartTime(now)
                    setTimerState('EXECUTION')
                    lastCountdownSecondRef.current = COUNTDOWN_SECONDS
                }
            }

            if (tutStartTime) {
                setElapsedTut(now - tutStartTime)
            }

            if (restStartTime) {
                setElapsedRest(now - restStartTime)
            }
        }, 100)

        return () => {
            if (timerRef.current) clearInterval(timerRef.current)
        }
    }, [tutStartTime, restStartTime, sessionStartTime, countdownEndTime, timerState, playCountdownBeep, playFinalBeep])

    // Vibrate when rest complete
    useEffect(() => {
        if ((timerState !== 'REST' && timerState !== 'TRANSITION') || !template) return

        const targetRest = template.exercises[currentExerciseIndex]?.restSeconds || 90
        const restMs = targetRest * 1000

        if (elapsedRest >= restMs && !hasVibratedRef.current) {
            if ('vibrate' in navigator) {
                navigator.vibrate([200, 100, 200])
            }
            hasVibratedRef.current = true
        }
    }, [elapsedRest, timerState, template, currentExerciseIndex])

    async function requestWakeLock() {
        try {
            if ('wakeLock' in navigator) {
                wakeLockRef.current = await navigator.wakeLock.request('screen')
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

    // Start 5s countdown before TUT
    function startPreparation() {
        const endTime = Date.now() + (COUNTDOWN_SECONDS * 1000)
        setCountdownEndTime(endTime)
        setCountdown(COUNTDOWN_SECONDS)
        lastCountdownSecondRef.current = COUNTDOWN_SECONDS
        setTimerState('PREPARATION')
        setSetRegistered(false)
        hasVibratedRef.current = false
    }

    // End TUT, start rest
    function endExecution() {
        setLastTutTime(elapsedTut)
        setTutStartTime(null)
        setRestStartTime(Date.now())
        setElapsedRest(0)
        setTimerState('REST')
        setSetRegistered(false)
        hasVibratedRef.current = false

        if (template) {
            setReps(template.exercises[currentExerciseIndex].targetReps)
        }
    }

    // Register set data (during rest)
    const registerSet = useCallback(async () => {
        if (!session || !template || setRegistered) return

        const weightValue = typeof weight === 'string' ? parseFloat(weight) || 0 : weight

        const setData: SetData = {
            setNumber: currentSetIndex + 1,
            weight: weightValue,
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
        setSetRegistered(true)

        // Check if this was the last set of the exercise
        const templateEx = template.exercises[currentExerciseIndex]
        const isLastSetOfExercise = currentSetIndex + 1 >= templateEx.sets
        const isLastExercise = currentExerciseIndex + 1 >= template.exercises.length

        if (isLastSetOfExercise) {
            if (isLastExercise) {
                // Last set of last exercise - show finish button
                // Keep in REST state but setRegistered = true will show finish button
            } else {
                // Move to TRANSITION for inter-exercise rest
                setTimerState('TRANSITION')
            }
        }
        // If not last set, stay in REST, user can start next set when ready

    }, [session, template, currentExerciseIndex, currentSetIndex, weight, reps, rpe, technicalFailure, lastTutTime, elapsedRest, tutStartTime, setRegistered])

    // Start next set (from REST state after registering)
    function startNextSet() {
        if (!template) return

        const templateEx = template.exercises[currentExerciseIndex]
        const isLastSetOfExercise = currentSetIndex + 1 >= templateEx.sets

        if (!isLastSetOfExercise) {
            // Same exercise, next set
            setCurrentSetIndex(prev => prev + 1)
        }

        setRestStartTime(null)
        setElapsedRest(0)
        setElapsedTut(0)
        setLastTutTime(0)
        setTechnicalFailure(false)
        setSetRegistered(false)
        hasVibratedRef.current = false

        // Start countdown for next set
        startPreparation()
    }

    // Move to next exercise (from TRANSITION state)
    function startNextExercise() {
        setCurrentExerciseIndex(prev => prev + 1)
        setCurrentSetIndex(0)
        setRestStartTime(null)
        setElapsedRest(0)
        setElapsedTut(0)
        setLastTutTime(0)
        setTechnicalFailure(false)
        setSetRegistered(false)
        hasVibratedRef.current = false
        setTimerState('IDLE')
    }

    async function finishWorkout() {
        if (!session) return

        const completed = {
            ...session,
            completed: true,
            endTime: Date.now()
        }
        await db.saveSession(completed)
        releaseWakeLock()
        localStorage.removeItem(TIMER_STORAGE_KEY)

        setSummaryData(completed)
        setShowSummaryModal(true)
    }

    async function cancelWorkout() {
        if (session) {
            await db.deleteSession(session.id)
        }
        releaseWakeLock()
        localStorage.removeItem(TIMER_STORAGE_KEY)
        navigate('/')
    }

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

    function generateSummaryJSON(): string {
        if (!summaryData || !template) return ''

        const exerciseNames = exercises.reduce((acc, ex) => {
            acc[ex.id] = ex.name
            return acc
        }, {} as Record<string, string>)

        const summary = {
            workout: summaryData.templateName,
            date: new Date(summaryData.startTime).toISOString().split('T')[0],
            duration_minutes: Math.round((summaryData.endTime! - summaryData.startTime) / 60000),
            exercises: summaryData.exercises.map(ex => ({
                name: exerciseNames[ex.exerciseId] || ex.exerciseId,
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

        return JSON.stringify(summary, null, 2)
    }

    async function copyToClipboard() {
        const json = generateSummaryJSON()
        await navigator.clipboard.writeText(json)
        if ('vibrate' in navigator) {
            navigator.vibrate(100)
        }
    }

    function closeSummaryAndGoHome() {
        setShowSummaryModal(false)
        navigate('/')
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
    const targetRestMs = (currentTemplateEx?.restSeconds || 90) * 1000
    const isRestComplete = elapsedRest >= targetRestMs

    // Determine if we're on the last set of last exercise
    const isLastSetOfExercise = currentSetIndex + 1 >= currentTemplateEx.sets
    const isLastExercise = currentExerciseIndex + 1 >= template.exercises.length
    const isVeryLastSet = isLastSetOfExercise && isLastExercise

    return (
        <div
            className={`page ${isRestComplete && (timerState === 'REST' || timerState === 'TRANSITION') ? 'flash' : ''}`}
            style={{
                paddingBottom: 'var(--spacing-md)',
                background: timerState === 'EXECUTION' ? 'var(--bg-secondary)' :
                    timerState === 'PREPARATION' ? 'var(--bg-tertiary)' : 'var(--bg-primary)'
            }}
        >
            {/* Header */}
            <header style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 'var(--spacing-md)'
            }}>
                <div>
                    <p className="text-muted" style={{ fontSize: '0.7rem' }}>Sesión</p>
                    <p style={{ fontSize: '1.25rem', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                        {formatTime(sessionElapsed)}
                    </p>
                </div>
                <button
                    className="btn-secondary"
                    style={{ padding: 'var(--spacing-xs) var(--spacing-sm)', color: 'var(--accent-danger)', fontSize: '0.875rem' }}
                    onClick={cancelWorkout}
                >
                    Cancelar
                </button>
            </header>

            {/* Current Exercise */}
            <div className="card" style={{ marginBottom: 'var(--spacing-md)', padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                <p className="text-muted" style={{ fontSize: '0.7rem', marginBottom: '2px' }}>
                    Ejercicio {currentExerciseIndex + 1}/{template.exercises.length}
                </p>
                <h2 style={{ fontSize: '1.25rem', marginBottom: '2px' }}>
                    {currentExercise?.name}
                </h2>
                <p style={{ color: 'var(--accent-primary)', fontSize: '0.9rem' }}>
                    Serie {currentSetIndex + 1}/{currentTemplateEx.sets}
                </p>
            </div>

            {/* Last Set Reference */}
            {lastSet && (
                <div className="card" style={{
                    marginBottom: 'var(--spacing-md)',
                    background: 'var(--bg-tertiary)',
                    padding: 'var(--spacing-xs) var(--spacing-sm)'
                }}>
                    <p className="text-muted" style={{ fontSize: '0.65rem' }}>Serie anterior:</p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                        <span>{lastSet.weight}kg × {lastSet.reps} · RPE {lastSet.rpe}</span>
                        <span className="text-muted" style={{ fontSize: '0.7rem' }}>
                            TUT: {formatTime(lastSet.tutMs)}
                        </span>
                    </div>
                </div>
            )}

            {/* Timer Display */}
            <div style={{ marginBottom: 'var(--spacing-md)' }}>
                {timerState === 'IDLE' && (
                    <div className="text-center">
                        <p className="timer-label">Listo para empezar</p>
                        <p className="timer-display" style={{ color: 'var(--text-muted)', fontSize: '3rem' }}>00:00</p>
                    </div>
                )}

                {timerState === 'PREPARATION' && (
                    <div className="text-center">
                        <p className="timer-label" style={{ color: 'var(--accent-warning)' }}>¡Prepárate!</p>
                        <p className="countdown-display" style={{ fontSize: '6rem' }}>{countdown}</p>
                    </div>
                )}

                {timerState === 'EXECUTION' && (
                    <div className="text-center">
                        <p className="timer-label" style={{ color: 'var(--accent-warning)' }}>⏱️ Tiempo bajo tensión</p>
                        <p className="timer-display" style={{ color: 'var(--accent-warning)', fontSize: '4rem' }}>
                            {formatTime(elapsedTut)}
                        </p>
                    </div>
                )}

                {(timerState === 'REST' || timerState === 'TRANSITION') && (
                    <div className="text-center">
                        <p className="timer-label" style={{ color: isRestComplete ? 'var(--accent-primary)' : 'var(--accent-rest)', fontSize: '0.75rem' }}>
                            {timerState === 'TRANSITION'
                                ? (isRestComplete ? '✅ Listo para siguiente ejercicio' : '🔄 Transición...')
                                : (isRestComplete ? '✅ ¡Descanso completo!' : '😮‍💨 Descansando...')
                            }
                        </p>
                        <p className="timer-display" style={{
                            color: isRestComplete ? 'var(--accent-primary)' : 'var(--accent-rest)',
                            fontSize: '4rem'
                        }}>
                            {formatTime(elapsedRest)}
                        </p>

                        {/* Rest progress bar */}
                        <div style={{
                            width: '100%',
                            height: '6px',
                            background: 'var(--bg-tertiary)',
                            borderRadius: 'var(--radius-full)',
                            marginTop: 'var(--spacing-sm)',
                            overflow: 'hidden'
                        }}>
                            <div style={{
                                width: `${Math.min(100, (elapsedRest / targetRestMs) * 100)}%`,
                                height: '100%',
                                background: isRestComplete ? 'var(--accent-primary)' : 'var(--accent-rest)',
                                transition: 'width 0.1s linear'
                            }} />
                        </div>

                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginTop: '4px',
                            fontSize: '0.75rem'
                        }}>
                            <span className="text-muted">TUT: {formatTime(lastTutTime)}</span>
                            <span className="text-muted">Obj: {currentTemplateEx.restSeconds}s</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Data Input (during REST, before registering) */}
            {timerState === 'REST' && !setRegistered && (
                <div className="card" style={{ marginBottom: 'var(--spacing-md)', padding: 'var(--spacing-sm)' }}>
                    {/* Weight input */}
                    <div style={{ marginBottom: 'var(--spacing-sm)' }}>
                        <label className="text-muted" style={{ fontSize: '0.7rem', display: 'block', marginBottom: '4px' }}>
                            Peso (kg)
                        </label>
                        <input
                            type="number"
                            value={weight}
                            onChange={e => setWeight(e.target.value)}
                            step={2.5}
                            placeholder="0"
                            style={{ fontSize: '1.25rem', textAlign: 'center', padding: 'var(--spacing-sm)' }}
                        />
                    </div>

                    {/* Reps and RPE side by side */}
                    <div style={{ display: 'flex', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-sm)' }}>
                        <ScrollPicker
                            label="Reps"
                            min={0}
                            max={30}
                            step={1}
                            value={reps}
                            onChange={setReps}
                        />
                        <ScrollPicker
                            label="RPE"
                            min={5}
                            max={10}
                            step={0.5}
                            value={rpe}
                            onChange={setRpe}
                        />
                    </div>

                    <label className="flex items-center gap-sm" style={{ cursor: 'pointer', fontSize: '0.875rem' }}>
                        <input
                            type="checkbox"
                            checked={technicalFailure}
                            onChange={e => setTechnicalFailure(e.target.checked)}
                            style={{ width: '18px', height: '18px' }}
                        />
                        <span>Fallo técnico</span>
                    </label>
                </div>
            )}

            {/* Registered confirmation */}
            {timerState === 'REST' && setRegistered && !isVeryLastSet && (
                <div className="card" style={{
                    marginBottom: 'var(--spacing-md)',
                    padding: 'var(--spacing-sm)',
                    background: 'var(--bg-tertiary)',
                    textAlign: 'center'
                }}>
                    <p style={{ color: 'var(--accent-primary)', marginBottom: '4px' }}>✅ Serie registrada</p>
                    <p className="text-muted" style={{ fontSize: '0.8rem' }}>
                        {typeof weight === 'string' ? parseFloat(weight) || 0 : weight}kg × {reps} reps · RPE {rpe}
                    </p>
                </div>
            )}

            {/* Action Buttons */}
            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                {timerState === 'IDLE' && (
                    <button className="btn-action btn-primary" onClick={startPreparation}>
                        🏋️ Iniciar Serie
                    </button>
                )}

                {timerState === 'PREPARATION' && (
                    <button className="btn-action btn-secondary" disabled>
                        ⏳ Preparándose...
                    </button>
                )}

                {timerState === 'EXECUTION' && (
                    <button className="btn-action btn-danger" onClick={endExecution}>
                        ⏹️ Fin de Serie
                    </button>
                )}

                {timerState === 'REST' && !setRegistered && (
                    <button
                        className="btn-action btn-primary"
                        onClick={registerSet}
                    >
                        ✅ Registrar Serie
                    </button>
                )}

                {timerState === 'REST' && setRegistered && !isVeryLastSet && (
                    <button
                        className={`btn-action ${isRestComplete ? 'btn-primary' : 'btn-rest'}`}
                        onClick={startNextSet}
                    >
                        ➡️ Iniciar Siguiente Serie
                    </button>
                )}

                {timerState === 'REST' && setRegistered && isVeryLastSet && (
                    <button
                        className="btn-action btn-primary"
                        onClick={finishWorkout}
                    >
                        🏁 Finalizar Entrenamiento
                    </button>
                )}

                {timerState === 'TRANSITION' && (
                    <button
                        className={`btn-action ${isRestComplete ? 'btn-primary' : 'btn-rest'}`}
                        onClick={startNextExercise}
                    >
                        ➡️ Siguiente Ejercicio
                    </button>
                )}
            </div>

            {/* Summary Modal */}
            <Modal
                isOpen={showSummaryModal}
                onClose={closeSummaryAndGoHome}
                title="🎉 ¡Completado!"
            >
                {summaryData && (
                    <div>
                        <div className="card" style={{ marginBottom: 'var(--spacing-md)' }}>
                            <div className="summary-stat">
                                <span className="summary-stat-label">Duración</span>
                                <span className="summary-stat-value">
                                    {Math.round((summaryData.endTime! - summaryData.startTime) / 60000)} min
                                </span>
                            </div>
                            <div className="summary-stat">
                                <span className="summary-stat-label">Ejercicios</span>
                                <span className="summary-stat-value">{summaryData.exercises.length}</span>
                            </div>
                            <div className="summary-stat">
                                <span className="summary-stat-label">Series</span>
                                <span className="summary-stat-value">
                                    {summaryData.exercises.reduce((sum, ex) => sum + ex.sets.length, 0)}
                                </span>
                            </div>
                        </div>

                        <textarea
                            readOnly
                            value={generateSummaryJSON()}
                            style={{ marginBottom: 'var(--spacing-sm)', minHeight: '150px', fontSize: '0.75rem' }}
                        />

                        <button className="btn-action btn-primary" onClick={copyToClipboard}>
                            📋 Copiar JSON
                        </button>
                        <button
                            className="btn-action btn-secondary"
                            style={{ marginTop: 'var(--spacing-xs)' }}
                            onClick={closeSummaryAndGoHome}
                        >
                            Cerrar
                        </button>
                    </div>
                )}
            </Modal>
        </div>
    )
}
