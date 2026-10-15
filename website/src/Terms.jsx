import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowUpRight } from 'lucide-react'
import terms from '../../TERMS_AND_CONDITIONS.md?raw'
import privacy from '../../PRIVACY_POLICY.md?raw'


function InlineText({ text }) {
  return text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\(https:\/\/[^)]+\)|underratedgames22@gmail\.com)/g).map((part, i) =>
    part.startsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong>
      : part.startsWith('[') ? <a key={i} href={part.match(/\]\((.+)\)$/)[1]}>{part.slice(1, part.indexOf(']'))}</a>
      : part === 'underratedgames22@gmail.com' ? <a key={i} href={`mailto:${part}`}>{part}</a>
        : part)
}

function Content({ text }) {
  return text.trim().split(/\n\s*\n/).map((block, i) => block.startsWith('- ')
    ? <ul key={i}>{block.split('\n').map((line, j) => <li key={j}><InlineText text={line.replace(/^- /, '')} /></li>)}</ul>
    : <p key={i}>{block.split('\n').map((line, j) => <span key={j}>{j > 0 && <br />}<InlineText text={line.trim()} /></span>)}</p>)
}

export default function Terms({ policy = 'terms' }) {
  const isPrivacy = policy === 'privacy'
  const sections = (isPrivacy ? privacy : terms).split(/^## /m)
  const title = isPrivacy ? 'Privacy Policy' : 'Terms and Conditions'
  const [activeSection, setActiveSection] = useState(null)
  useEffect(() => {
    const elements = Array.from(document.querySelectorAll('.legal-content section'))
    let frame = null
    const update = () => {
      frame = null
      // Match the section links' scroll offset below the fixed header.
      let current = null
      for (const element of elements) {
        if (element.getBoundingClientRect().top <= 120) current = element.id
        else break
      }
      if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) {
        current = elements.at(-1)?.id ?? null
      }
      setActiveSection(current)
    }
    const scheduleUpdate = () => {
      if (frame === null) frame = requestAnimationFrame(update)
    }
    window.addEventListener('scroll', scheduleUpdate, { passive: true })
    window.addEventListener('resize', scheduleUpdate)
    scheduleUpdate()
    return () => {
      window.removeEventListener('scroll', scheduleUpdate)
      window.removeEventListener('resize', scheduleUpdate)
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [])
  useEffect(() => {
    const previousTitle = document.title
    document.title = `${title} — UNYON`
    const section = window.location.hash.match(/^#\/(?:terms|privacy)\/section-(\d+)$/)
    if (section) document.getElementById(`${policy}-section-${section[1]}`)?.scrollIntoView()
    else window.scrollTo(0, 0)
    return () => { document.title = previousTitle }
  }, [])

  return <>
    <header className="nav legal-nav">
      <a className="logo" href="#top" aria-label="UNYON home"><span className="logo-mark"><span /><span /></span><span>UNYON</span></a>
      <a className="text-link legal-back" href="#top"><ArrowLeft size={16} /> Back to UNYON</a>
    </header>
    <main className="legal-page">
      <section className="legal-hero">
        <p className="eyebrow">THE USEFUL DETAILS</p>
        <h1>{isPrivacy ? 'Privacy' : 'Terms &'}<br /><em>{isPrivacy ? 'policy.' : 'conditions.'}</em></h1>
        <p>{isPrivacy ? 'Your data, explained. What we process, why we need it, and the choices you have.' : 'The terms for using UNYON. From your first download to your next conversation.'}</p>
        <div className="legal-meta"><span>BASED IN INDIA</span><a href="mailto:underratedgames22@gmail.com">Contact support <ArrowUpRight size={13} /></a></div>
      </section>
      <div className="legal-layout">
        <aside className="legal-index"><p className="eyebrow">ON THIS PAGE</p><nav aria-label={`${title} contents`}>{sections.slice(1).map((section, i) => <a key={i} href={`#/${policy}/section-${i + 1}`} aria-current={activeSection === `${policy}-section-${i + 1}` ? 'location' : undefined}>{section.split('\n')[0]}</a>)}</nav></aside>
        <article className="legal-content">
          <div className="legal-intro"><Content text={sections[0].replace(/^# .+\n/, '')} /></div>
          {sections.slice(1).map((section, i) => {
            const [heading, ...body] = section.split('\n')
            return <section key={i} id={`${policy}-section-${i + 1}`}><h2>{heading}</h2><Content text={body.join('\n')} /></section>
          })}
          <a className="button button-dark" href="#top"><ArrowLeft size={16} /> Back to UNYON</a>
        </article>
      </div>
    </main>
    <footer className="legal-footer"><span>© 2026 UNYON</span><a href={isPrivacy ? "#/terms" : "#/privacy"}>{isPrivacy ? "Terms & conditions" : "Privacy Policy"}</a><a href="mailto:underratedgames22@gmail.com">underratedgames22@gmail.com <ArrowUpRight size={14} /></a></footer>
  </>
}
