import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

function AdminEntry() {
  const backend = import.meta.env.VITE_AUTH_SERVER_URL || (import.meta.env.DEV ? 'http://127.0.0.1:8787' : '')
  let destination
  try { const url = new URL(backend); if (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) destination = `${url.origin}/admin` } catch {}
  return <>
    <header className="nav legal-nav"><a className="logo" href="/" aria-label="UNYON home"><span className="logo-mark"><span /><span /></span><span>UNYON</span></a><a className="text-link legal-back" href="/">← Back to UNYON</a></header>
    <main className="legal-page"><section className="legal-hero"><p className="eyebrow">BEHIND THE SCENES / ADMIN ACCESS</p><h1>A little clarity.<br /><em>For your app.</em></h1><p>Your server, your AI, and everything that keeps UNYON running. Sign in with your authorized Google account to take a look.</p><div className="hero-actions">{destination ? <a className="button button-dark" href={destination}>Continue to admin login <span aria-hidden="true">↗</span></a> : <p role="status">Admin access is not configured on this website.</p>}</div></section></main>
  </>
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>{window.location.pathname.replace(/\/$/, '') === '/admin' ? <AdminEntry /> : <App />}</React.StrictMode>,
)
