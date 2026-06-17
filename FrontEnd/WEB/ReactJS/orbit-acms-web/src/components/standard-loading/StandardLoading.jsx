import './standard-loading.css'

function StandardLoading({ text = 'Processing...' }) {
  return (
    <div className="standard-loading" role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true">
        <div className="spinnerin" />
      </div>
      <span className="standard-loading-sr-only">{text}</span>
    </div>
  )
}

export default StandardLoading
