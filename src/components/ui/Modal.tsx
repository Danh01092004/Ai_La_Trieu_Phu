import { useEffect, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/utils'

interface Props {
  open: boolean
  onClose: () => void
  children: ReactNode
  /** Extra classes for the panel (width, padding, radius). */
  panelClassName?: string
  backdropClassName?: string
  ariaLabel?: string
}

/** Animated modal shell: dimmed backdrop, spring-in glass panel, ESC to close. */
export function Modal({
  open,
  onClose,
  children,
  panelClassName,
  backdropClassName,
  ariaLabel,
}: Props) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <div
            className={cn('absolute inset-0 bg-night-900/85 backdrop-blur-md', backdropClassName)}
            onClick={onClose}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            className={cn(
              'glass animated-border relative w-full rounded-3xl',
              panelClassName,
            )}
            initial={{ scale: 0.88, y: 32, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.88, y: 32, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 26 }}
            onClick={(event) => event.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
