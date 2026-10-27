import { useEffect, useState } from 'react'
import {
  ArrowRight, AudioLines, Bot, Check, ChevronDown, Command, Download, FileText,
  History, Home, Keyboard, LockKeyhole, Menu, Mic2, MonitorUp, MousePointer2,
  NotebookPen, Plus, ShieldCheck, Sparkles, X, Zap
} from 'lucide-react'
import { detectPlatform, DOWNLOADS } from './platform'
import Terms from './Terms'

const features = [
  { icon: AudioLines, number: '01', title: 'Hears the room.', text: 'Live transcription separates your voice from system audio, so every conversation stays clear.' },
  { icon: Sparkles, number: '02', title: 'Knows the context.', text: 'Add your resume, notes, PDFs, docs, images, and code. UNYON brings the right detail forward at the right moment.' },
  { icon: Zap, number: '03', title: 'Helps in the moment.', text: 'Get natural, ready-to-say answers while the conversation is still happening—not a summary after it ends.' },
  { icon: Keyboard, number: '04', title: 'Stays out of the way.', text: 'Pause, hide, click through, and position the floating window with keyboard shortcuts while you stay focused.' },
]

const faqs = [
  ['Does my data leave my computer?', 'Yes, when you use UNYON. Audio is sent to our transcription provider, and relevant prompts or selected context are sent to our AI provider. Account details, session history, and uploaded resumes may be stored with UNYON until you email us to request deletion.'],
  ['How do I delete my stored data?', 'Email underratedgames22@gmail.com from your registered email address to request deletion. We keep server-stored data until you ask us to delete it, except for records we must retain by law. Delete local notes and files separately on your device.'],
  ['Do my purchased minutes expire?', 'No. Purchased usage minutes never expire, so you can use your remaining balance whenever you need it.'],
  ['What do I need to run UNYON?', 'A supported macOS or Windows computer, an internet connection, and an active UNYON account with available session minutes.'],
  ['Is UNYON only for interviews?', 'Not at all. Use it in meetings, study sessions, research, writing, coding, presentations, or anytime you want private, context-aware help.'],
  ['Can others see the overlay?', 'UNYON uses operating-system capture protection on supported platforms. This is best-effort protection, not an absolute security or DLP boundary.'],
  ['What does beta access include?', 'Beta members get early builds, direct access to the team, and a real say in what we build next. Expect rapid updates—and a few rough edges along the way.'],
]

function Logo({ light = false }) {
  return <a className={`logo ${light ? 'logo-light' : ''}`} href="#top" aria-label="UNYON home">
    <img className="app-icon logo-icon" src="/app-icon.svg" alt="" /><span>UNYON</span>
  </a>
}

function AppIcon({ className = '' }) {
  return <img className={`app-icon ${className}`} src="/app-icon.svg" alt="UNYON app icon" />
}

function WindowsMark({ size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 5.1 11.1 4v7.5H3V5.1Zm9.2-1.25L21 2.6v8.9h-8.8V3.85ZM3 12.5h8.1V20L3 18.9v-6.4Zm9.2 0H21v8.9l-8.8-1.25V12.5Z"/></svg>
}

function AppleMark({ size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.32.03-1.75-.79-3.27-.79-1.53 0-2 .76-3.25.82-1.3.05-2.28-1.32-3.12-2.53-1.7-2.46-3-6.95-1.25-10  .87-1.52 2.43-2.48 4.12-2.51 1.28-.03 2.5.87 3.27.87.76 0 2.2-1.08 3.7-.92.63.03 2.4.25 3.54 1.92-.09.06-2.11 1.25-2.09 3.75.03 2.99 2.62 3.99 2.65 4-.03.09-.41 1.42-1.25 2.78M13 3.5c.7-.8 1.83-1.4 2.83-1.44.13 1.17-.34 2.35-1 3.19-.65.85-1.73 1.51-2.77 1.43-.15-1.15.39-2.35.94-3.18Z"/></svg>
}

function PlatformIcon({ platform, size = 18 }) {
  if (platform === 'mac') return <AppleMark size={size} />
  if (platform === 'windows') return <WindowsMark size={size} />
  return <Download size={size} />
}

function DownloadButton({ platform, className = 'button button-dark', onUnavailable, onDownload }) {
  const target = platform === 'other' ? null : DOWNLOADS[platform]
  if (!target) return <a className={className} href="#downloads">Choose your download <ArrowRight size={17}/></a>
  if (!target.available) return <button className={className} onClick={onUnavailable}><PlatformIcon platform={platform}/> Join the {target.name} waitlist <ArrowRight size={17}/></button>
  return <button className={className} onClick={() => onDownload(platform)} data-platform={platform}><PlatformIcon platform={platform}/> Download beta for {target.name} <Download size={16}/></button>
}

const installSteps = {
  mac: [
    <>Open the downloaded <strong>UNYON .dmg</strong> file.</>,
    <>Drag <strong>UNYON</strong> into the Applications folder.</>,
    <>In Applications, right-click UNYON and choose <strong>Open</strong>.</>,
    <>If macOS blocks it, open <strong>System Settings → Privacy &amp; Security</strong>, then choose <strong>Open Anyway</strong>.</>,
  ],
  windows: [
    <>Open the downloaded <strong>UNYON Setup .exe</strong> file.</>,
    <>If Windows SmartScreen appears, choose <strong>More info</strong>.</>,
    <>Choose <strong>Run anyway</strong>, then complete the installer.</>,
  ],
}

function DownloadModal({ platform, onClose }) {
  const target = DOWNLOADS[platform]
  useEffect(() => {
    const key = (event) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  return <div className="modal-backdrop" onMouseDown={onClose} role="presentation">
    <div className="modal download-modal" role="dialog" aria-modal="true" aria-labelledby="download-title" onMouseDown={event => event.stopPropagation()}>
      <button className="modal-close" onClick={onClose} aria-label="Close"><X size={19}/></button>
      <div className="download-modal-platform"><AppIcon /></div>
      <p className="eyebrow">BEFORE YOU INSTALL</p>
      <h2 id="download-title">Install UNYON on {target.name}.</h2>
      <p className="modal-copy">This beta is currently unsigned, so {target.name} may show a security warning. Follow these steps to open it safely.</p>
      <ol className="install-steps">{installSteps[platform].map((step, index) => <li key={index}><span>{index + 1}</span><p>{step}</p></li>)}</ol>
      <div className="unsigned-note"><ShieldCheck size={17}/><p>Only install UNYON when you downloaded it from <strong>myunyon.com</strong>.</p></div>
      <a className="button button-dark download-confirm" href={target.url} download data-platform={platform} onClick={onClose}>I understand — download for {target.name} <Download size={16}/></a>
    </div>
  </div>
}

function BetaModal({ onClose }) {
  const [sent, setSent] = useState(false)
  const submit = (event) => { event.preventDefault(); setSent(true) }
  useEffect(() => {
    const key = (event) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  return <div className="modal-backdrop" onMouseDown={onClose} role="presentation">
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="beta-title" onMouseDown={e => e.stopPropagation()}>
      <button className="modal-close" onClick={onClose} aria-label="Close"><X size={19} /></button>
      {sent ? <div className="success-state">
        <div className="success-icon"><Check /></div>
        <p className="eyebrow">YOU'RE ON THE LIST</p>
        <h2 id="beta-title">Welcome to the inner circle.</h2>
        <p>We’ll be in touch with UNYON beta access details soon.</p>
        <button className="button button-dark" onClick={onClose}>Back to UNYON</button>
      </div> : <>
        <p className="eyebrow">PRIVATE BETA</p>
        <h2 id="beta-title">Be early to what’s next.</h2>
        <p className="modal-copy">Tell us a little about how you work. We’re opening a limited number of beta spots for macOS and Windows.</p>
        <form onSubmit={submit}>
          <label>Name<input required placeholder="Your name" /></label>
          <label>Work email<input required type="email" placeholder="you@company.com" /></label>
          <div className="form-row">
            <label>Platform<select required defaultValue=""><option value="" disabled>Select one</option><option>macOS</option><option>Windows</option></select></label>
            <label>Use case<select required defaultValue=""><option value="" disabled>Select one</option><option>Meetings</option><option>Interviews</option><option>Studying</option><option>Research</option><option>Other</option></select></label>
          </div>
          <button className="button button-dark form-submit">Request beta access <ArrowRight size={16} /></button>
          <small>By joining, you agree to receive beta-related updates. No spam.</small>
        </form>
      </>}
    </div>
  </div>
}

function ProductDemo() {
  return <div className="demo-stage" aria-label="UNYON desktop app preview">
    <div className="demo-glow" />
    <div className="unyon-window dashboard-window">
      <aside className="app-sidebar">
        <AppIcon className="demo-app-icon" />
        <button className="side-active"><Home size={15}/><span>Home</span></button>
        <button><NotebookPen size={15}/><span>Notepad</span></button>
        <button><FileText size={15}/><span>Global context</span></button>
        <button><History size={15}/><span>Session history</span></button>
        <div className="sidebar-spacer" />
        <button><Sparkles size={15}/><span>Recharge &amp; offers</span></button>
      </aside>
      <div className="app-main">
        <div className="app-header"><span><AppIcon className="header-app-icon"/> UNYON</span><div className="demo-balance"><b>47:32 left</b><i><Plus size={12}/></i></div></div>
        <div className="home-demo">
          <div className="demo-home-title"><div><small>YOUR CONVERSATION COPILOT</small><h3>Make every conversation count.</h3></div><button><Plus size={13}/> Create session</button></div>
          <div className="demo-guide-grid">
            <article><small>01</small><FileText/><b>Bring your context</b><p>Add your company, resume, and session notes.</p></article>
            <article><small>02</small><AudioLines/><b>Stay in the conversation</b><p>UNYON listens to system audio while you focus.</p></article>
            <article><small>03</small><Sparkles/><b>Answer with confidence</b><p>See a focused response in the floating window.</p></article>
          </div>
          <div className="demo-hotkeys"><span><Keyboard size={14}/> Keyboard shortcuts</span><kbd>⌘ ⇧ P</kbd><em>Pause / play session</em><kbd>⌘ ⇧ ←</kbd><em>Snap floating window</em></div>
        </div>
      </div>
    </div>
    <div className="floating-answer">
      <div className="floating-listening"><i/> SYSTEM AUDIO <span>…how would you improve activation for new users?</span></div>
      <div className="floating-label"><Sparkles size={12}/> ANSWERING</div>
      <strong>How would you approach improving activation?</strong>
      <p>I’d first identify the earliest moment users experience value, then use funnel data and interviews to find where momentum drops.</p>
      <div className="floating-foot"><span>1 / 1</span><kbd>⌘ ⇧ P</kbd></div>
    </div>
    <div className="privacy-chip"><ShieldCheck size={14}/><span>Private floating window</span><i/></div>
  </div>
}

function App() {
  const [legalPage, setLegalPage] = useState(() => window.location.hash.match(/^#\/(terms|privacy)(?:\/|$)/)?.[1] ?? null)
  useEffect(() => {
    const navigate = () => {
      const legal = window.location.hash.match(/^#\/(terms|privacy)(?:\/|$)/)?.[1] ?? null
      setLegalPage(legal)
      const section = window.location.hash.match(/^#\/(terms|privacy)\/section-(\d+)$/)
      if (section) requestAnimationFrame(() => document.getElementById(`${section[1]}-section-${section[2]}`)?.scrollIntoView())
      else if (legal || window.location.hash === '#top') window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', navigate)
    navigate()
    return () => window.removeEventListener('hashchange', navigate)
  }, [])
  const [menuOpen, setMenuOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [downloadPlatform, setDownloadPlatform] = useState(null)
  const [openFaq, setOpenFaq] = useState(0)
  const [headerHidden, setHeaderHidden] = useState(false)
  const [platform, setPlatform] = useState('other')
  useEffect(() => setPlatform(detectPlatform()), [])
  useEffect(() => {
    const observer = new IntersectionObserver(entries => entries.forEach(e => e.isIntersecting && e.target.classList.add('in-view')), { threshold: .12 })
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [legalPage])
  useEffect(() => {
    let lastY = window.scrollY
    let ticking = false
    const updateHeader = () => {
      const currentY = Math.max(window.scrollY, 0)
      const movement = currentY - lastY

      if (!menuOpen) {
        if (currentY < 80) setHeaderHidden(false)
        else if (movement > 6) setHeaderHidden(true)
        else if (movement < -4) setHeaderHidden(false)
      }

      lastY = currentY
      ticking = false
    }
    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(updateHeader)
        ticking = true
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [menuOpen])
  if (legalPage) return <Terms key={legalPage} policy={legalPage} />
  return <>
    <header className={`nav ${headerHidden ? 'nav-hidden' : ''}`} id="top">
      <Logo />
      <nav className={menuOpen ? 'nav-links open' : 'nav-links'}>
        <a href="#how" onClick={() => setMenuOpen(false)}>How it works</a>
        <a href="#features" onClick={() => setMenuOpen(false)}>Features</a>
        <a href="#privacy" onClick={() => setMenuOpen(false)}>Privacy</a>
        <a href="#faq" onClick={() => setMenuOpen(false)}>FAQ</a>
      </nav>
      <DownloadButton platform={platform} className="nav-cta" onUnavailable={() => setModalOpen(true)} onDownload={setDownloadPlatform} />
      <button className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">{menuOpen ? <X/> : <Menu/>}</button>
    </header>

    <main>
      <section className="hero">
        <div className="hero-copy reveal">
          <div className="beta-pill"><span/> {platform === 'other' ? 'BETA · MAC & WINDOWS' : `BETA FOR ${DOWNLOADS[platform].name.toUpperCase()}`}</div>
          <h1>The AI that<br/><em>stays with you.</em></h1>
          <p>UNYON listens, understands, and helps in real time—with your resume, company context, and the conversation working together.</p>
          <div className="hero-actions"><DownloadButton platform={platform} onUnavailable={() => setModalOpen(true)} onDownload={setDownloadPlatform} /><a className="text-link" href="#how">See how it works <span>↓</span></a></div>
        </div>
        <ProductDemo />
        <div className="hero-trust"><span><AudioLines size={15}/> System audio aware</span><span><MonitorUp size={15}/> Works above any app</span><span><Command size={15}/> One shortcut away</span></div>
      </section>

      <section className="statement reveal" id="how">
        <p className="eyebrow">MEET YOUR SECOND MIND</p>
        <h2>Not another bot in the call.<br/><span>Just intelligence, right beside you.</span></h2>
        <p className="statement-copy">UNYON lives quietly on your desktop and understands the conversation as it unfolds. When you need a thought, an answer, or a detail—you’re already there.</p>
      </section>

      <section className="process-section">
        <div className="process-copy reveal"><p className="eyebrow lime">IN THE MOMENT</p><h2>From question<br/>to clarity.</h2><p>No tab switching. No awkward pauses. UNYON listens to both sides of the conversation, finds the relevant context, and gives you a natural answer in seconds.</p><div className="shortcut"><kbd>⌘</kbd><span>+</span><kbd>↵</kbd><span>Ask UNYON</span></div></div>
        <div className="transcript-card reveal">
          <div className="transcript-head"><span><i/> LIVE TRANSCRIPT</span><span>02:14</span></div>
          <div className="line muted"><b>INTERVIEWER</b><p>Tell me about a time you had to align a team around a difficult decision.</p></div>
          <div className="thinking"><Sparkles size={15}/><span>Finding relevant experience</span><i/><i/><i/></div>
          <div className="response"><div><b>SUGGESTED RESPONSE</b><span>Based on “Launch retro.pdf”</span></div><p>In my last role, our team was split between shipping quickly and rebuilding a fragile part of the product. I brought engineering and design together around one shared constraint…</p><div className="response-actions"><button><AudioLines size={13}/> Shorter</button><button><MousePointer2 size={13}/> More specific</button></div></div>
        </div>
      </section>

      <section className="features" id="features">
        <div className="section-heading reveal"><p className="eyebrow">ONE WORKSPACE. EVERY MOMENT.</p><h2>More present.<br/><em>More prepared.</em></h2></div>
        <div className="feature-grid">{features.map(({icon: Icon, number, title, text}) => <article className="feature-card reveal" key={number}><div className="feature-top"><span>{number}</span><Icon/></div><h3>{title}</h3><p>{text}</p></article>)}</div>
      </section>

      <section className="context-section reveal">
        <div className="context-ui">
          <div className="context-top"><span>YOUR CONTEXT</span><button><Plus size={13}/> Add files</button></div>
          {[['Resume_2026.pdf','PROFILE','12 KB'],['Launch retro.docx','WORK','84 KB'],['Product notes.md','NOTES','6 KB']].map(([name,type,size],i) => <div className="file-row" key={name}><span className={`file-icon c${i}`}><FileText size={17}/></span><div><b>{name}</b><small>{type}</small></div><span>{size}</span><Check size={15}/></div>)}
          <div className="context-status"><span/><p><b>Context ready</b><small>3 sources ready for this session</small></p></div>
        </div>
        <div className="context-copy"><p className="eyebrow">BRING WHAT YOU KNOW</p><h2>Your context makes<br/>the answer <em>yours.</em></h2><p>Resumes, project notes, briefs, PDFs, images, or code. UNYON connects your private knowledge to the conversation—so every response sounds less like AI and more like you.</p><div className="file-types"><span>PDF</span><span>DOCX</span><span>IMAGES</span><span>CODE</span><span>+ MORE</span></div></div>
      </section>

      <section className="privacy" id="privacy">
        <div className="privacy-glow"/><div className="privacy-inner reveal"><div className="privacy-lock"><LockKeyhole/></div><p className="eyebrow lime">PRIVACY, EXPLAINED</p><h2>Your context.<br/>Handled with care.</h2><p>UNYON sends audio to Groq for transcription and sends relevant prompts or selected context to Gemini for answers. Account details, session history, and uploaded resumes may be stored with UNYON until you email us to request deletion, except for records we must retain by law.</p><div className="privacy-flow"><div><Mic2/><span>Your conversation</span></div><ArrowRight/><div><AudioLines/><span>Transcription</span></div><ArrowRight/><div><Bot/><span>Answer engine</span></div><ArrowRight/><div><Sparkles/><span>Focused answer</span></div></div><small>Capture protection is best-effort OS protection and not a complete security boundary.</small></div>
      </section>

      <section className="use-cases reveal"><p className="eyebrow">MADE FOR REAL WORK</p><div className="use-scroll"><span>INTERVIEWS</span><i>✦</i><span>MEETINGS</span><i>✦</i><span>RESEARCH</span><i>✦</i><span>STUDY</span><i>✦</i><span>WRITING</span></div></section>

      <section className="faq" id="faq"><div className="faq-title reveal"><p className="eyebrow">QUESTIONS, ANSWERED</p><h2>The useful<br/>details.</h2><p>Still curious? Beta members get a direct line to the team.</p></div><div className="faq-list reveal">{faqs.map(([q,a],i) => <div className={`faq-item ${openFaq === i ? 'open' : ''}`} key={q}><button onClick={() => setOpenFaq(openFaq === i ? -1 : i)}><span>{q}</span><ChevronDown/></button><div className="faq-answer"><p>{a}</p></div></div>)}</div></section>

      <section className="downloads-section" id="downloads"><div className="downloads-copy reveal"><p className="eyebrow">DOWNLOAD THE UNYON BETA</p><h2>Built for your<br/><em>desktop.</em></h2><p>UNYON is currently in beta. Choose your platform to try the latest build, and expect frequent improvements as we learn from early users.</p></div><div className="download-options reveal">{Object.entries(DOWNLOADS).map(([key, item]) => <div className={`download-card ${key === platform ? 'recommended' : ''}`} key={key}><div className="download-icon"><AppIcon /></div><div><span>{key === platform ? 'BETA · DETECTED DEVICE' : 'BETA DESKTOP APP'}</span><h3>UNYON for {item.name}</h3><p>{item.detail}</p></div>{item.available ? <button onClick={() => setDownloadPlatform(key)}><Download size={16}/> Download beta</button> : <button onClick={() => setModalOpen(true)}>Join beta waitlist <ArrowRight size={15}/></button>}</div>)}</div></section>

      <section className="cta-section"><div className="cta-orb"/><div className="reveal"><p className="eyebrow lime">UNYON PRIVATE BETA</p><h2>Be in the room.<br/><em>And ahead of it.</em></h2><p>Try the beta and help shape an AI copilot that works with you—not through your data.</p><DownloadButton platform={platform} className="button button-light" onUnavailable={() => setModalOpen(true)} onDownload={setDownloadPlatform} /><span className="spots"><i/> {platform !== 'other' && DOWNLOADS[platform].available ? `Beta available for ${DOWNLOADS[platform].name}` : 'New beta spots opening weekly'}</span></div></section>
    </main>

    <footer><div><Logo light/><p>Your conversation copilot.<br/>Here when it matters.</p></div><div className="footer-links"><div><b>PRODUCT</b><a href="#features">Features</a><a href="#privacy">Privacy</a><button onClick={() => setModalOpen(true)}>Beta access</button></div><div><b>COMPANY</b><a href="mailto:underratedgames22@gmail.com">Contact</a><a href="#faq">FAQ</a><a href="#/terms">Terms &amp; conditions</a><a href="#/privacy">Privacy Policy</a></div></div><div className="footer-bottom"><span>© 2026 UNYON</span><span>Built for the conversation.</span></div></footer>
    {modalOpen && <BetaModal onClose={() => setModalOpen(false)} />}
    {downloadPlatform && <DownloadModal platform={downloadPlatform} onClose={() => setDownloadPlatform(null)} />}
  </>
}

export default App
