import { useMemo, useState, useEffect } from 'react'
import { Activity, ArrowUpRight, BookOpen, ChevronDown, ChevronRight, CircleHelp, FileText, LayoutGrid, Link2, Menu, Plus, Search, Settings2, SlidersHorizontal, Users, X, Lock, Trash2, Shield, User } from 'lucide-react'
import './App.css'

const phases = [
  ['Scoping & Data Recon', 'SC', 'coral', 'scoping'], 
  ['WBGT / UTCI Engine', 'WE', 'yellow', 'wbgt-utci'], 
  ['Dataset + ML Model', 'ML', 'blue', 'ml-model'],
  ['Backend + PostGIS', 'BE', 'green', 'backend-postgis'], 
  ['Dashboard', 'DB', 'violet', 'dashboard'], 
  ['Alert API', 'AP', 'orange', 'alert-api'], 
  ['Integration & Pitch', 'IP', 'pink', 'integration'],
]

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Helper: get a smart time-of-day greeting
function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

// Helper: format "created_at" to relative time
function timeAgo(dateStr) {
  if (!dateStr) return 'Recently'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function LockScreen({ onUnlock }) {
  const [inputPin, setInputPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_URL}/api/roles`, {
        headers: { 'x-access-pin': inputPin }
      })
      if (res.status === 401) throw new Error('Incorrect PIN')
      if (!res.ok) throw new Error('Server error: ' + res.statusText)
      
      localStorage.setItem('fieldnotes_pin', inputPin)
      onUnlock(inputPin)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: 'var(--bg-shell)', padding: '1rem' }}>
      <div style={{ padding: '2.5rem 2rem', background: 'var(--surface)', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', textAlign: 'center', maxWidth: '340px', width: '100%', border: '1px solid var(--border)' }}>
        <div style={{ display: 'inline-flex', padding: '12px', borderRadius: '50%', backgroundColor: 'var(--bg-shell)', marginBottom: '1rem' }}>
          <Lock size={24} style={{ color: 'var(--text-muted)' }} />
        </div>
        <h2 style={{ margin: '0 0 0.5rem 0' }}>Fieldnotes</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '2rem' }}>Enter the access PIN to view this research log.</p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <input 
            type="password" 
            value={inputPin} 
            onChange={(e) => setInputPin(e.target.value)} 
            placeholder="PIN Code" 
            autoFocus 
            style={{ padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border)', textAlign: 'center', fontSize: '1.2rem', letterSpacing: '4px' }}
          />
          {error && <span style={{ color: 'coral', fontSize: '0.85rem' }}>{error}</span>}
          <button type="submit" className="primary-button" disabled={loading} style={{ justifyContent: 'center', marginTop: '0.5rem' }}>
            {loading ? <Activity size={16} /> : 'Unlock Access'}
          </button>
        </form>
      </div>
    </div>
  )
}

function App() {
  const [activeTab, setActiveTab] = useState('overview')
  
  // Auth state
  const [pin, setPin] = useState(localStorage.getItem('fieldnotes_pin') || '')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [currentUser, setCurrentUser] = useState(localStorage.getItem('fieldnotes_user') || '')

  // Data states — allFindings holds everything for overview stats
  const [findings, setFindings] = useState([])
  const [allFindings, setAllFindings] = useState([])
  const [team, setTeam] = useState([])
  
  // Network states
  const [loadingFindings, setLoadingFindings] = useState(false)
  const [errorFindings, setErrorFindings] = useState(null)
  const [loadingTeam, setLoadingTeam] = useState(false)
  const [errorTeam, setErrorTeam] = useState(null)
  
  // UI states
  const [quickRef, setQuickRef] = useState(true)
  const [composer, setComposer] = useState(false)
  const [search, setSearch] = useState('')
  const [mobileNav, setMobileNav] = useState(false)
  const [form, setForm] = useState({ title: '', body: '', author: currentUser || '', tags: '' })
  
  const selectedPhase = phases.find((phase) => phase[0] === activeTab)
  const activeSlug = selectedPhase ? selectedPhase[3] : null

  // Current user role
  const enrichedTeam = useMemo(() => {
    return team.map(member => ({
      ...member,
      role: member.lane || member.role,
      initials: member.initials || member.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase(),
      status: member.status || 'online',
      color: member.color || 'violet'
    }))
  }, [team])

  const currentMember = useMemo(() => enrichedTeam.find(t => t.name === currentUser), [enrichedTeam, currentUser])
  const isAdmin = currentMember && currentMember.role && currentMember.role.toLowerCase().includes('admin')

  // 1. Fetch Team/Roles on mount and verify auth
  useEffect(() => {
    const fetchTeam = async () => {
      setLoadingTeam(true)
      setErrorTeam(null)
      try {
        const res = await fetch(`${API_URL}/api/roles`, {
          headers: { 'x-access-pin': pin }
        })
        if (res.status === 401) {
          setIsAuthenticated(false)
          setAuthChecked(true)
          return
        }
        if (!res.ok) throw new Error('Failed to fetch team roles')
        
        setIsAuthenticated(true)
        setAuthChecked(true)
        const data = await res.json()
        setTeam(data)
      } catch (err) {
        setErrorTeam(err.message)
        setIsAuthenticated(true) 
        setAuthChecked(true)
      } finally {
        setLoadingTeam(false)
      }
    }
    fetchTeam()
  }, [pin])

  // 2. Fetch ALL findings once for overview stats
  useEffect(() => {
    if (!isAuthenticated) return
    const fetchAll = async () => {
      try {
        const res = await fetch(`${API_URL}/api/findings`, { headers: { 'x-access-pin': pin } })
        if (res.ok) {
          const data = await res.json()
          setAllFindings(data)
        }
      } catch (_) { /* silent — overview stats are best-effort */ }
    }
    fetchAll()
  }, [isAuthenticated, pin])

  // 3. Fetch Findings whenever activeTab changes
  useEffect(() => {
    if (!isAuthenticated) return;
    const fetchFindings = async () => {
      setLoadingFindings(true)
      setErrorFindings(null)
      try {
        let url = `${API_URL}/api/findings`
        if (activeSlug) {
          url += `?phase=${encodeURIComponent(activeSlug)}`
        }
        const res = await fetch(url, { headers: { 'x-access-pin': pin } })
        if (res.status === 401) {
          setIsAuthenticated(false)
          return
        }
        if (!res.ok) throw new Error('Failed to fetch findings')
        const data = await res.json()
        setFindings(data)
      } catch (err) {
        setErrorFindings(err.message)
      } finally {
        setLoadingFindings(false)
      }
    }
    fetchFindings()
  }, [activeSlug, isAuthenticated, pin])

  const visibleFindings = useMemo(() => {
    return findings.filter((finding) => {
      const isCorrectPhase = activeTab === 'overview' ? true : finding.phase === activeSlug;
      if (!isCorrectPhase) return false;
      if (!search) return true;
      const tagsStr = Array.isArray(finding.tags) ? finding.tags.join(' ') : (finding.tags || '');
      return `${finding.title} ${finding.body} ${tagsStr}`.toLowerCase().includes(search.toLowerCase());
    })
  }, [activeTab, activeSlug, findings, search])

  const selectTab = (tab) => { setActiveTab(tab); setSearch(''); setMobileNav(false) }

  // Compute dynamic progress: % of phases that have at least 1 finding
  const phasesWithFindings = useMemo(() => {
    const filled = new Set(allFindings.map(f => f.phase))
    return filled.size
  }, [allFindings])
  const progressPercent = Math.round((phasesWithFindings / phases.length) * 100)

  // POST new finding
  const addFinding = async (event) => {
    event.preventDefault()
    if (!form.title.trim() || !form.body.trim()) return
    
    try {
      const res = await fetch(`${API_URL}/api/findings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-access-pin': pin },
        body: JSON.stringify({
          phase: activeSlug,
          contributor: form.author,
          title: form.title,
          body: form.body,
          tags: form.tags
        })
      })
      if (res.status === 401) {
        setIsAuthenticated(false)
        return
      }
      if (!res.ok) throw new Error('Failed to save finding')
      const savedFinding = await res.json()
      
      setFindings([savedFinding, ...findings])
      setAllFindings([savedFinding, ...allFindings])
      setForm({ title: '', body: '', author: currentUser || (enrichedTeam.length > 0 ? enrichedTeam[0].name : ''), tags: '' })
      setComposer(false)
    } catch (err) {
      alert("Error adding finding: " + err.message)
    }
  }

  // DELETE finding
  const deleteFinding = async (id) => {
    if (!currentUser) {
      alert("Please select your user profile in the top right to delete findings.");
      return;
    }
    if (!confirm("Are you sure you want to delete this finding? This cannot be undone.")) return;
    try {
      const res = await fetch(`${API_URL}/api/findings/${id}`, {
        method: 'DELETE',
        headers: { 'x-access-pin': pin, 'x-current-user': currentUser }
      });
      if (res.status === 401) {
        setIsAuthenticated(false)
        return
      }
      if (res.status === 403) {
        alert("You can only delete your own findings. Admins can delete anyone's.");
        return;
      }
      if (!res.ok) throw new Error('Failed to delete finding');
      
      setFindings(findings.filter(f => f.id !== id));
      setAllFindings(allFindings.filter(f => f.id !== id));
    } catch(err) {
      alert("Error deleting finding: " + err.message);
    }
  }

  // Early returns for Auth
  if (!authChecked) {
    return <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}><Activity size={24} style={{ animation: 'spin 2s linear infinite', color: 'var(--text-muted)' }} /></div>
  }

  if (!isAuthenticated) {
    return <LockScreen onUnlock={(newPin) => setPin(newPin)} />
  }

  return <div className="app-shell">
    <header className="topbar">
      <button className="mobile-menu" onClick={() => setMobileNav(!mobileNav)} aria-label="Toggle navigation"><Menu size={20} /></button>
      <div className="brand"><span className="brand-mark"><Activity size={17} /></span><span>Fieldnotes</span><span className="brand-slash">/</span><span className="brand-project">SIH26083</span></div>
      <div className="top-actions">
        <span className="sync-status">
          <span 
            className={`status-dot ${errorFindings || errorTeam ? 'error' : ''}`} 
            style={errorFindings || errorTeam ? { backgroundColor: 'red' } : {}} 
          /> 
          {errorFindings || errorTeam ? 'Disconnected' : loadingFindings || loadingTeam ? 'Syncing...' : 'Synced'}
        </span>
        <button className="icon-button" onClick={() => { localStorage.removeItem('fieldnotes_pin'); localStorage.removeItem('fieldnotes_user'); setPin(''); setCurrentUser(''); setIsAuthenticated(false); }} aria-label="Lock" title="Lock & Sign Out"><Lock size={18} /></button>
        
        <select 
          value={currentUser} 
          onChange={(e) => {
            setCurrentUser(e.target.value)
            localStorage.setItem('fieldnotes_user', e.target.value)
          }}
          title="Select current user"
          style={{ background: 'transparent', border: 'none', fontWeight: '600', fontSize: '0.9rem', color: 'var(--text-main)', outline: 'none', cursor: 'pointer', marginLeft: '0.5rem' }}
        >
          <option value="">Select User</option>
          {enrichedTeam.map(member => <option key={member.name} value={member.name}>{member.name}{member.role?.toLowerCase().includes('admin') ? ' ★' : ''}</option>)}
        </select>
        {currentUser && (
          <span className={`avatar small ${currentMember?.color || 'gray'}`}>
            {currentMember?.initials || currentUser.slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>
    </header>
    
    <div className="workspace">
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="sidebar-section-label">Workspace</div>
        <button className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => selectTab('overview')}><LayoutGrid size={16} /> Overview</button>
        <button className={`nav-item ${activeTab === 'Team & Roles' ? 'active' : ''}`} onClick={() => selectTab('Team & Roles')}><Users size={16} /> Team & Roles <span className="nav-count">{enrichedTeam.length}</span></button>
        
        <div className="sidebar-section-label phase-heading">Project phases <span>{phases.length}</span></div>
        <nav className="phase-list">
          {phases.map(([label, short, color, slug]) => (
            <button key={label} className={`phase-item ${activeTab === label ? 'active' : ''}`} onClick={() => selectTab(label)}>
              <span className={`phase-icon ${color}`}>{short}</span>
              <span>{label}</span>
              <span className="phase-count">{allFindings.filter((f) => f.phase === slug).length || ''}</span>
            </button>
          ))}
        </nav>
        
        <div className="sidebar-bottom">
          <div className="project-meter">
            <div><span>Project coverage</span><strong>{progressPercent}%</strong></div>
            <div className="meter-track"><span style={{ width: `${progressPercent}%` }} /></div>
            <small>{phasesWithFindings} of {phases.length} phases active · {allFindings.length} findings</small>
          </div>
        </div>
      </aside>
      
      <main className="main-content">
        {activeTab === 'overview' ? (
          <Overview allFindings={allFindings} team={enrichedTeam} selectTab={selectTab} loading={loadingFindings} currentUser={currentUser} progressPercent={progressPercent} phasesWithFindings={phasesWithFindings} />
        ) : activeTab === 'Team & Roles' ? (
          <TeamView team={enrichedTeam} setTeam={setTeam} loading={loadingTeam} error={errorTeam} pin={pin} setIsAuthenticated={setIsAuthenticated} currentUser={currentUser} isAdmin={isAdmin} />
        ) : (
          <>
            <div className="content-header">
              <div>
                <div className="eyebrow"><span className={`phase-mini ${selectedPhase[2]}`}>{selectedPhase[1]}</span> Project phase</div>
                <h1>{activeTab}</h1>
                <p className="subtitle">Shared findings, decisions, and links for this lane.</p>
              </div>
              <button className="primary-button" onClick={() => { setForm({ title: '', body: '', author: currentUser || (enrichedTeam.length > 0 ? enrichedTeam[0].name : ''), tags: '' }); setComposer(true) }}><Plus size={17} /> Add finding</button>
            </div>
            
            <div className="toolbar">
              <div className="search-box"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search findings..." /></div>
              <button className="filter-button"><SlidersHorizontal size={15} /> Filter <ChevronDown size={14} /></button>
              <span className="result-count">{visibleFindings.length} {visibleFindings.length === 1 ? 'finding' : 'findings'}</span>
            </div>
            
            <section className={`reference-card ${quickRef ? 'open' : ''}`}>
              <button className="reference-toggle" onClick={() => setQuickRef(!quickRef)}>
                <span className="reference-icon"><BookOpen size={16} /></span>
                <span><strong>Quick reference</strong><small>Pin the thresholds, formulas, and decisions your team keeps reaching for.</small></span>
                <ChevronRight className="reference-chevron" size={17} />
              </button>
              {quickRef && (
                <div className="reference-body">
                  <div><span className="reference-label">WBGT heat stress</span><code>0.7 × Tw + 0.2 × Tg + 0.1 × Ta</code></div>
                  <div><span className="reference-label">Current note</span><p>Reference data is a shared space for the team. Add your meteorological thresholds here.</p></div>
                  <button className="text-button">Edit reference <ArrowUpRight size={14} /></button>
                </div>
              )}
            </section>
            
            <div className="findings-list">
              {loadingFindings ? (
                <div className="empty-state">
                  <Activity size={28} />
                  <h3>Loading findings...</h3>
                  <p>Fetching the latest data from the server.</p>
                </div>
              ) : errorFindings ? (
                <div className="empty-state">
                  <CircleHelp size={28} color="coral" />
                  <h3>Couldn't load findings</h3>
                  <p>Check your connection or make sure the backend is running. ({errorFindings})</p>
                </div>
              ) : visibleFindings.length ? (
                visibleFindings.map((finding) => <FindingCard key={finding.id || Math.random()} finding={finding} team={enrichedTeam} currentUser={currentUser} isAdmin={isAdmin} deleteFinding={deleteFinding} />)
              ) : (
                <div className="empty-state">
                  <FileText size={28} />
                  <h3>No findings yet</h3>
                  <p>Click "Add finding" to log the first note for this phase.</p>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
    
    {composer && (
      <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setComposer(false)}>
        <form className="composer" onSubmit={addFinding}>
          <div className="composer-header">
            <div><span className="eyebrow">New finding</span><h2>Add to {activeTab}</h2></div>
            <button type="button" className="icon-button" onClick={() => setComposer(false)} aria-label="Close"><X size={19} /></button>
          </div>
          <label>Title<input autoFocus value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="What did the team learn?" /></label>
          <label>Notes / links<textarea value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} placeholder="Add context, a decision, or a useful link..." rows="5" /></label>
          <div className="form-grid">
            <label>Contributor
              <select value={form.author} onChange={(event) => setForm({ ...form, author: event.target.value })}>
                {enrichedTeam.map((member) => <option key={member.name} value={member.name}>{member.name}</option>)}
              </select>
            </label>
            <label>Tags<input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="data, decision" /></label>
          </div>
          <div className="composer-footer">
            <button type="button" className="secondary-button" onClick={() => setComposer(false)}>Cancel</button>
            <button className="primary-button" type="submit"><Plus size={16} /> Publish finding</button>
          </div>
        </form>
      </div>
    )}
  </div>
}

function FindingCard({ finding, team, currentUser, isAdmin, deleteFinding }) { 
  const authorName = finding.contributor || finding.author || 'Unknown';
  const author = team.find(t => t.name === authorName) || {};
  const initials = author.initials || authorName.substring(0, 2).toUpperCase();
  const color = author.color || 'gray';
  const time = timeAgo(finding.created_at);
  
  const canDelete = currentUser === authorName || isAdmin;

  let tags = [];
  if (Array.isArray(finding.tags)) tags = finding.tags;
  else if (typeof finding.tags === 'string') tags = finding.tags.split(',').map(t => t.trim()).filter(Boolean);

  return (
    <article className="finding-card">
      <div className="finding-meta">
        <span className={`avatar ${color}`}>{initials}</span>
        <span><strong>{authorName}</strong><small>{time}</small></span>
        {canDelete && (
          <button className="icon-button" onClick={() => deleteFinding(finding.id)} aria-label="Delete finding" title="Delete this finding" style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>
            <Trash2 size={16} />
          </button>
        )}
      </div>
      <h2>{finding.title}</h2>
      <p>{finding.body}</p>
      {tags.length > 0 && (
        <div className="card-footer">
          <div className="tags">{tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
        </div>
      )}
    </article>
  )
}

function Overview({ allFindings, team, selectTab, loading, currentUser, progressPercent, phasesWithFindings }) {
  // Compute which phases have findings, sorted by most recent
  const phaseActivity = useMemo(() => {
    return phases.map(([label, short, color, slug]) => {
      const phaseFindings = allFindings.filter(f => f.phase === slug)
      const latest = phaseFindings.length > 0 ? phaseFindings[0].created_at : null
      return { label, short, color, slug, count: phaseFindings.length, latest }
    }).sort((a, b) => {
      if (!a.latest && !b.latest) return 0
      if (!a.latest) return 1
      if (!b.latest) return -1
      return new Date(b.latest) - new Date(a.latest)
    })
  }, [allFindings])

  // Count unique contributors
  const uniqueContributors = useMemo(() => {
    return new Set(allFindings.map(f => f.contributor)).size
  }, [allFindings])

  return (
    <div className="overview">
      <div className="content-header">
        <div>
          <div className="eyebrow"><span className="pulse-dot" /> Team workspace</div>
          <h1>{getGreeting()}, {currentUser ? currentUser.split(' ')[0] : 'Team'}</h1>
          <p className="subtitle">Here is where the heatwave early-warning prototype stands today.</p>
        </div>
      </div>
      <div className="overview-grid">
        <div className="overview-feature">
          <div className="feature-top"><span className="feature-kicker">Project coverage</span><span>{phasesWithFindings} / {phases.length} phases</span></div>
          <h2>Research progress</h2>
          <p>{phasesWithFindings === 0 ? 'No findings logged yet. Start by adding your first research note to a phase.' : `${phasesWithFindings} of ${phases.length} phases have documented findings. ${phases.length - phasesWithFindings} still need attention.`}</p>
          <div className="feature-progress">
            <span><strong>{progressPercent}%</strong> phase coverage</span>
            <div className="meter-track"><span style={{ width: `${progressPercent}%` }} /></div>
          </div>
        </div>
        <div className="stat-card">
          <span>All findings</span>
          <strong>{loading ? '...' : allFindings.length}</strong>
          <small>Across {phasesWithFindings} phases</small>
        </div>
        <div className="stat-card">
          <span>Contributors</span>
          <strong>{loading ? '...' : uniqueContributors}</strong>
          <small>{team.length} team members</small>
        </div>
      </div>
      <div className="section-heading"><h2>All phases</h2><span>Sorted by recent activity</span></div>
      <div className="phase-overview-list">
        {phaseActivity.map(({ label, short, color, count, latest }) => (
          <button key={label} onClick={() => selectTab(label)}>
            <span className={`phase-icon ${color}`}>{short}</span>
            <span>
              <strong>{label}</strong>
              <small>{loading ? '...' : count} {count === 1 ? 'finding' : 'findings'}{latest ? ` · last updated ${timeAgo(latest)}` : ' · no findings yet'}</small>
            </span>
            <ChevronRight size={17} />
          </button>
        ))}
      </div>
    </div>
  ) 
}

function TeamView({ team, setTeam, loading, error, pin, setIsAuthenticated, currentUser, isAdmin }) { 
  const [newMember, setNewMember] = useState({ name: '', role: '' })
  const [adding, setAdding] = useState(false)
  
  const canManageTeam = team.length === 0 || isAdmin

  // POST new team role
  const addMember = async (event) => { 
    event.preventDefault(); 
    if (!newMember.name.trim()) return; 
    setAdding(true);
    try {
      const res = await fetch(`${API_URL}/api/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-access-pin': pin, 'x-current-user': currentUser },
        body: JSON.stringify({ name: newMember.name, lane: newMember.role })
      })
      if (res.status === 401) {
        setIsAuthenticated(false)
        return
      }
      if (res.status === 403) {
        alert("Only admins can add team members. Select an Admin profile from the top-right dropdown.");
        return;
      }
      if (!res.ok) throw new Error('Failed to add role')
      const savedRole = await res.json()
      
      setTeam([...team, savedRole])
      setNewMember({ name: '', role: '' })
    } catch (err) {
      alert("Error adding team member: " + err.message)
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="team-view">
      <div className="content-header">
        <div>
          <div className="eyebrow"><Users size={15} /> Workspace people</div>
          <h1>Team & Roles</h1>
          <p className="subtitle">Keep the lanes clear so findings always have an owner.</p>
        </div>
        {canManageTeam && (
          <button className="primary-button" onClick={() => document.querySelector('.team-form input')?.focus()}><Plus size={17} /> Add teammate</button>
        )}
      </div>

      {!currentUser && (
        <div style={{ background: '#fef3cd', border: '1px solid #ffc107', borderRadius: '6px', padding: '12px 16px', marginBottom: '20px', fontSize: '12px', color: '#856404' }}>
          ⚠️ Select your profile from the top-right dropdown to see admin controls.
        </div>
      )}

      <section className="team-card">
        <div className="team-card-heading">
          <div>
            <h2>Project crew</h2>
            <p>{team.length} {team.length === 1 ? 'person' : 'people'} sharing this log</p>
          </div>
          <span className="team-avatars">
            {team.slice(0, 4).map((member) => (
              <span key={member.name} className={`avatar small ${member.color}`}>{member.initials}</span>
            ))}
          </span>
        </div>
        {loading ? (
          <div className="empty-state" style={{ padding: '2rem' }}>
            <Activity size={24} />
            <p>Loading team roles...</p>
          </div>
        ) : error ? (
           <div className="empty-state" style={{ padding: '2rem' }}>
            <p style={{ color: 'coral' }}>Error loading team: {error}</p>
          </div>
        ) : team.length === 0 ? (
          <div className="empty-state" style={{ padding: '2rem' }}>
            <Users size={28} />
            <h3>No team members yet</h3>
            <p>Add the first person below to get started. The first member can be an Admin.</p>
          </div>
        ) : (
          <div className="team-list">
            {team.map((member) => (
              <div className="team-row" key={member.name}>
                <span className={`avatar ${member.color}`}>{member.initials}</span>
                <div>
                  <strong>{member.name}</strong>
                  <small style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {member.role?.toLowerCase().includes('admin') ? <Shield size={10} /> : <User size={10} />}
                    {member.role || 'No role assigned'}
                  </small>
                </div>
                {member.role?.toLowerCase().includes('admin') && (
                  <span style={{ fontSize: '9px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '.08em', color: '#b45309', background: '#fef3cd', padding: '2px 8px', borderRadius: '10px', marginLeft: 'auto' }}>Admin</span>
                )}
                {!member.role?.toLowerCase().includes('admin') && (
                  <span style={{ fontSize: '9px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '.08em', color: '#4b7a5e', background: '#e8f5e9', padding: '2px 8px', borderRadius: '10px', marginLeft: 'auto' }}>Member</span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
      {canManageTeam && (
        <form className="team-form" onSubmit={addMember}>
          <div><span className="eyebrow">Quick add</span><h2>Bring someone in</h2></div>
          <input value={newMember.name} onChange={(event) => setNewMember({ ...newMember, name: event.target.value })} placeholder="Teammate name" disabled={adding} />
          <input value={newMember.role} onChange={(event) => setNewMember({ ...newMember, role: event.target.value })} placeholder='Role (e.g. "Admin" or "Member")' disabled={adding} />
          <button className="secondary-button" type="submit" disabled={adding}>
            {adding ? <Activity size={16} /> : <Plus size={16} />} 
            {adding ? ' Adding...' : ' Add'}
          </button>
        </form>
      )}
    </div>
  )
}

export default App
