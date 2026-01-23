import { useRef, useEffect, useCallback } from 'react'

interface ScrollPickerProps {
    min: number
    max: number
    step: number
    value: number
    onChange: (value: number) => void
    label: string
    suffix?: string
}

export default function ScrollPicker({ min, max, step, value, onChange, label, suffix = '' }: ScrollPickerProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const isScrollingRef = useRef(false)
    const scrollTimeoutRef = useRef<number | null>(null)

    // Generate values array
    const values: number[] = []
    for (let v = min; v <= max; v += step) {
        values.push(Math.round(v * 10) / 10)
    }

    const itemHeight = 36
    const visibleItems = 3
    const containerHeight = itemHeight * visibleItems

    const currentIndex = values.findIndex(v => Math.abs(v - value) < step / 2)

    const scrollToIndex = useCallback((index: number, smooth = false) => {
        if (containerRef.current) {
            const scrollTop = index * itemHeight
            containerRef.current.scrollTo({
                top: scrollTop,
                behavior: smooth ? 'smooth' : 'auto'
            })
        }
    }, [itemHeight])

    useEffect(() => {
        if (currentIndex >= 0) {
            scrollToIndex(currentIndex, false)
        }
    }, [])

    useEffect(() => {
        if (!isScrollingRef.current && currentIndex >= 0) {
            scrollToIndex(currentIndex, true)
        }
    }, [value, currentIndex, scrollToIndex])

    const handleScroll = () => {
        if (!containerRef.current) return

        isScrollingRef.current = true

        if (scrollTimeoutRef.current) {
            clearTimeout(scrollTimeoutRef.current)
        }

        scrollTimeoutRef.current = window.setTimeout(() => {
            if (!containerRef.current) return

            const scrollTop = containerRef.current.scrollTop
            const index = Math.round(scrollTop / itemHeight)
            const clampedIndex = Math.max(0, Math.min(values.length - 1, index))

            scrollToIndex(clampedIndex, true)

            const newValue = values[clampedIndex]
            if (newValue !== value) {
                onChange(newValue)
            }

            isScrollingRef.current = false
        }, 80)
    }

    return (
        <div className="scroll-picker-wrapper">
            <label className="scroll-picker-label">{label}</label>
            <div className="scroll-picker-outer">
                <div
                    className="scroll-picker-container"
                    ref={containerRef}
                    onScroll={handleScroll}
                    style={{ height: containerHeight }}
                >
                    <div style={{ height: itemHeight }} />
                    {values.map((v, idx) => {
                        const isSelected = idx === currentIndex
                        return (
                            <div
                                key={v}
                                className={`scroll-picker-item ${isSelected ? 'selected' : ''}`}
                                style={{ height: itemHeight }}
                                onClick={() => {
                                    scrollToIndex(idx, true)
                                    onChange(v)
                                }}
                            >
                                {v}{suffix}
                            </div>
                        )
                    })}
                    <div style={{ height: itemHeight }} />
                </div>
                <div className="scroll-picker-highlight" />
            </div>
        </div>
    )
}
