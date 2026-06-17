import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'

// Global error reporting for debugging settings page blank screen
const reportError = (errorMsg, url, line, col, errorObj) => {
  fetch('http://localhost:8080/api/debug/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: errorMsg || 'Unknown error',
      url: url || window.location.href,
      stack: errorObj ? errorObj.stack : `Line: ${line}, Col: ${col}`
    })
  }).catch(() => {});
};

window.onerror = function(message, source, lineno, colno, error) {
  reportError(message, source, lineno, colno, error);
  return false;
};

window.onunhandledrejection = function(event) {
  const reason = event.reason;
  reportError(
    reason ? (reason.message || String(reason)) : 'Unhandled Promise Rejection',
    null,
    null,
    null,
    reason instanceof Error ? reason : null
  );
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
