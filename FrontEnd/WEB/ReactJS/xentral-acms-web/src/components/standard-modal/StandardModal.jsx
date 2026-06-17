import { useEffect } from 'react'
import './standard-modal.css'

function StandardModal({
  isOpen,
  title = 'Notice',
  message = '',
  confirmText = 'OK',
  onConfirm,
  onClose
}) {
  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose?.()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) {
    return null
  }

  return (
    <div className="standard-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="standard-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="standard-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="standard-modal-header">
          <h3 id="standard-modal-title">{title}</h3>
        </div>
        <p className="standard-modal-message">{message}</p>
        <div className="standard-modal-footer">
          <button
            type="button"
            className="standard-modal-btn"
            onClick={() => {
              if (onConfirm) {
                onConfirm()
                return
              }
              onClose?.()
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

export default StandardModal
