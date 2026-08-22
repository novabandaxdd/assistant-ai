/**
 * Toast notification system for JARVIS Brain.
 * Listens to `jarvis:toast` custom events and renders floating toasts.
 */

import { useEffect, useState, useCallback } from 'react'
import styles from './Toast.module.css'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

interface ToastItem {
  id: string
  message: string
  type: ToastType
  action?: { label: string; onClick: () => void }
}

let _toastId = 0

function SuccessIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
      <circle cx="10" cy="10" r="9" /><path d="M6 10l3 3 5-6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function ErrorIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
      <circle cx="10" cy="10" r="9" /><path d="M7 7l6 6M13 7l-6 6" strokeLinecap="round"/>
    </svg>
  )
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
      <circle cx="10" cy="10" r="9" /><path d="M10 9v5M10 7v.5" strokeLinecap="round"/>
    </svg>
  )
}

function WarnIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
      <path d="M9.13 3.5L2 17h16L10.87 3.5a1 1 0 0 0-1.74 0z" strokeLinejoin="round"/>
      <path d="M10 9v4M10 14.5v.5" strokeLinecap="round"/>
    </svg>
  )
}

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <SuccessIcon />,
  error:   <ErrorIcon />,
  info:    <InfoIcon />,
  warning: <WarnIcon />,
}

interface SingleToastProps {
  item: ToastItem
  onDismiss: (id: string) => void
}

function SingleToast({ item, onDismiss }: SingleToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(item.id), 3500)
    return () => clearTimeout(timer)
  }, [item.id, onDismiss])

  return (
    <div className={`${styles.toast} ${styles[item.type]}`} role="alert">
      <span className={styles.icon}>{ICONS[item.type]}</span>
      <span className={styles.message}>{item.message}</span>
      {item.action && (
        <button className={styles.action} onClick={() => { item.action!.onClick(); onDismiss(item.id) }}>
          {item.action.label}
        </button>
      )}
      <button className={styles.close} onClick={() => onDismiss(item.id)} aria-label="Fechar">✕</button>
    </div>
  )
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ message: string; type?: ToastType; action?: { label: string; onClick: () => void } }>).detail
      const toast: ToastItem = {
        id: String(++_toastId),
        message: detail.message,
        type: detail.type ?? 'info',
        action: detail.action,
      }
      setToasts(prev => {
        const next = [...prev, toast]
        return next.slice(-3) // max 3 visible
      })
    }
    window.addEventListener('jarvis:toast', handler)
    return () => window.removeEventListener('jarvis:toast', handler)
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className={styles.container} aria-live="polite">
      {toasts.map(t => (
        <SingleToast key={t.id} item={t} onDismiss={dismiss} />
      ))}
    </div>
  )
}
