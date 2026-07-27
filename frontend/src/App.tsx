import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'

type Dart = { label: string; value: number; is_double?: boolean }
type ScoreEntry = { kind: 'total' | 'darts'; total?: number; darts?: Dart[] }
type Player = { id: string; name: string; remaining: number; darts_thrown: number; visits: number; points_scored: number }
type Turn = {
  player_id: string; player_name: string; score: number; entry: ScoreEntry; outcome: 'scored' | 'bust' | 'checkout'; remaining_after: number
  before_players: Player[]; before_current_player: number
}
type Game = { start_score: number; players: Player[]; current_player: number; turns: Turn[]; winner_id?: string | null }
type ResolveResponse = { status: 'accepted' | 'bust' | 'rejected' | 'finished'; snapshot: Game; announcement: string; checkout_suggestion?: string | null; message?: string }
type ParseResponse = { status: 'parsed' | 'ambiguous' | 'unrecognized'; candidates: ScoreEntry[]; message: string }
type HistoryItem = { id: string; finishedAt: string; winner: string; players: { name: string; average: string; visits: number }[] }

const ACTIVE_KEY = 'auto-oche.active-game'
const HISTORY_KEY = 'auto-oche.history'

type RecognitionInstance = {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number
  start(): void; stop(): void
  onresult: ((event: { results: { [index: number]: { isFinal: boolean; [index: number]: { transcript: string } } }; resultIndex: number }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}
type RecognitionConstructor = new () => RecognitionInstance

function readStorage<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || '') as T } catch { return fallback }
}

function makeGame(names: string[]): Game {
  return {
    start_score: 501,
    players: names.map((name, index) => ({ id: `player-${Date.now()}-${index}`, name: name.trim() || `Player ${index + 1}`, remaining: 501, darts_thrown: 0, visits: 0, points_scored: 0 })),
    current_player: 0,
    turns: [],
    winner_id: null,
  }
}

function repairPlayerStats(game: Game): Game {
  const players = game.players.map((player) => ({ ...player, darts_thrown: 0, visits: 0, points_scored: 0 }))
  for (const turn of game.turns) {
    const player = players.find((candidate) => candidate.id === turn.player_id)
    if (!player) continue
    player.visits += 1
    player.darts_thrown += turn.entry.kind === 'darts' ? turn.entry.darts?.length || 0 : 3
    if (turn.outcome !== 'bust') player.points_scored += turn.score
  }
  return { ...game, players }
}

function loadActiveGame() {
  const saved = readStorage<Game | null>(ACTIVE_KEY, null)
  return saved ? repairPlayerStats(saved) : null
}

function speak(message: string) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(message)
  utterance.lang = 'en-GB'
  utterance.rate = 1.05
  window.speechSynthesis.speak(utterance)
}

async function api<T>(path: string, body: object): Promise<T> {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!response.ok) throw new Error('The scorer could not be reached.')
  return response.json() as Promise<T>
}

function average(player: Player) {
  return player.darts_thrown ? ((player.points_scored / player.darts_thrown) * 3).toFixed(1) : '0.0'
}

export default function App() {
  const [game, setGame] = useState<Game | null>(loadActiveGame)
  const [history, setHistory] = useState<HistoryItem[]>(() => readStorage<HistoryItem[]>(HISTORY_KEY, []))
  const [screen, setScreen] = useState<'setup' | 'game' | 'history'>(() => loadActiveGame() ? 'game' : 'setup')
  const [playerCount, setPlayerCount] = useState(1)
  const [names, setNames] = useState(['Player 1', 'Player 2'])
  const [total, setTotal] = useState('')
  const [dartText, setDartText] = useState('')
  const [notice, setNotice] = useState('')
  const [listening, setListening] = useState(false)
  const [alwaysListening, setAlwaysListening] = useState(false)
  const [pending, setPending] = useState<ScoreEntry | null>(null)
  const [pendingText, setPendingText] = useState('')
  const [checkout, setCheckout] = useState<string | null>(null)
  const recognitionRef = useRef<RecognitionInstance | null>(null)
  const alwaysListeningRef = useRef(false)
  const processingSpeechRef = useRef(false)
  const parseAndSubmitRef = useRef<(transcript: string) => Promise<void>>(async () => undefined)

  useEffect(() => { if (game) localStorage.setItem(ACTIVE_KEY, JSON.stringify(game)); else localStorage.removeItem(ACTIVE_KEY) }, [game])
  useEffect(() => localStorage.setItem(HISTORY_KEY, JSON.stringify(history)), [history])
  useEffect(() => () => recognitionRef.current?.stop(), [])
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isTyping = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT' || target?.isContentEditable
      if (event.key.toLowerCase() !== 'x' || event.repeat || isTyping || listening || alwaysListening || !game || screen !== 'game') return
      event.preventDefault()
      startVoice()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [alwaysListening, game, listening, screen])

  const activePlayer = game ? game.players[game.current_player] : null
  const lastTurn = game?.turns.at(-1)
  const suggestion = useMemo(() => {
    if (!game || game.winner_id || !activePlayer) return null
    const score = activePlayer.remaining
    if (score < 2 || score > 170) return null
    if (score <= 40 && score % 2 === 0) return `D${score / 2}`
    return 'Ask the scorer'
  }, [activePlayer, game])

  function beginGame(event: FormEvent) {
    event.preventDefault()
    setGame(makeGame(names.slice(0, playerCount)))
    setCheckout(null)
    setScreen('game')
    setNotice('Game on. Enter a score or use the microphone.')
  }

  function saveCompleted(nextGame: Game) {
    const winner = nextGame.players.find((player) => player.id === nextGame.winner_id)
    if (!winner) return
    const item: HistoryItem = {
      id: `${Date.now()}`,
      finishedAt: new Date().toISOString(),
      winner: winner.name,
      players: nextGame.players.map((player) => ({ name: player.name, average: average(player), visits: player.visits })),
    }
    setHistory((current) => [item, ...current].slice(0, 20))
  }

  async function submit(entry: ScoreEntry) {
    if (!game) return
    try {
      const response = await api<ResolveResponse>('/api/turns/resolve', { snapshot: game, entry })
      setNotice(response.message || response.announcement)
      if (response.status === 'rejected') return
      setGame(response.snapshot)
      setCheckout(response.checkout_suggestion || null)
      speak(response.announcement)
      if (response.status === 'finished') { stopAlwaysListening(); saveCompleted(response.snapshot) }
      setTotal('')
      setDartText('')
      setPending(null)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to score this visit.')
    }
  }

  function submitTotal(event: FormEvent) {
    event.preventDefault()
    const value = Number(total)
    if (!Number.isInteger(value) || value < 0 || value > 180) { setNotice('Enter a whole visit score from 0 to 180.'); return }
    void submit({ kind: 'total', total: value })
  }

  async function parseAndSubmit(transcript: string) {
    setPendingText(transcript)
    try {
      const parsed = await api<ParseResponse>('/api/score/parse', { transcript })
      if (parsed.status === 'parsed' && parsed.candidates[0]) {
        await submit(parsed.candidates[0])
      } else if (parsed.candidates[0]) {
        setPending(parsed.candidates[0]); setNotice(parsed.message)
      } else {
        setNotice(`${parsed.message} Use manual entry to correct it.`)
      }
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not understand that score.') }
  }
  parseAndSubmitRef.current = parseAndSubmit

  function submitDarts(event: FormEvent) {
    event.preventDefault()
    if (!dartText.trim()) return
    void parseAndSubmit(dartText)
  }

  function startVoice(persistent = false) {
    const browserWindow = window as Window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor }
    const Recognition = browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition
    if (!Recognition) {
      if (persistent) { alwaysListeningRef.current = false; setAlwaysListening(false) }
      setNotice('Voice recognition is supported in Chrome and Edge. Use the manual score controls in this browser.')
      return
    }
    const recognition = new Recognition()
    recognitionRef.current = recognition
    recognition.lang = 'en-GB'; recognition.continuous = persistent; recognition.interimResults = false; recognition.maxAlternatives = 3
    recognition.onresult = (event) => {
      const result = event.results[event.resultIndex]
      if (!result.isFinal || processingSpeechRef.current) return
      processingSpeechRef.current = true
      if (!persistent) setListening(false)
      void parseAndSubmitRef.current(result[0].transcript).finally(() => { processingSpeechRef.current = false })
    }
    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') stopAlwaysListening()
      if (!persistent || event.error !== 'no-speech') setNotice(`Voice input: ${event.error}. Try again or enter the score manually.`)
    }
    recognition.onend = () => {
      if (!alwaysListeningRef.current) { setListening(false); return }
      const restart = () => {
        if (!alwaysListeningRef.current) return
        if (processingSpeechRef.current) { window.setTimeout(restart, 250); return }
        try { recognition.start(); setListening(true) } catch { window.setTimeout(restart, 250) }
      }
      window.setTimeout(restart, 250)
    }
    setListening(true); setNotice(persistent ? 'Always listening is on. Say each visit clearly, then pause.' : 'Listening… say a visit total or up to three dart calls.')
    recognition.start()
  }

  function toggleAlwaysListening() {
    if (alwaysListening) { stopAlwaysListening(); return }
    alwaysListeningRef.current = true
    setAlwaysListening(true)
    startVoice(true)
  }

  function stopAlwaysListening() {
    alwaysListeningRef.current = false
    setAlwaysListening(false)
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setListening(false)
    setNotice('Always listening is off.')
  }

  function undo() {
    if (!game || !lastTurn) return
    const turns = game.turns.slice(0, -1)
    const restored: Game = { ...game, players: lastTurn.before_players, current_player: lastTurn.before_current_player, turns, winner_id: null }
    setGame(restored); setCheckout(null); setNotice('Last visit undone.')
  }

  function reset() {
    if (window.confirm('Discard the current game?')) { stopAlwaysListening(); setGame(null); setCheckout(null); setScreen('setup'); setNotice('') }
  }

  if (screen === 'history') return <HistoryView history={history} onBack={() => setScreen(game ? 'game' : 'setup')} onClear={() => setHistory([])} />
  if (!game || screen === 'setup') return <Setup playerCount={playerCount} setPlayerCount={setPlayerCount} names={names} setNames={setNames} onStart={beginGame} onHistory={() => setScreen('history')} />

  const winner = game.players.find((player) => player.id === game.winner_id)
  return <main className="app-shell">
    <header className="topbar"><button className="brand" onClick={reset}>AUTO <span>OCHE</span></button><div><button className="quiet" onClick={() => setScreen('history')}>History</button><button className="quiet" onClick={reset}>New game</button></div></header>
    <section className="game-header">
      <p className="eyebrow">{winner ? 'Match complete' : `Visit ${game.turns.length + 1}`}</p>
      <h1>{winner ? `${winner.name} wins` : `${activePlayer?.name} to throw`}</h1>
      <p className="notice" aria-live="polite">{notice}</p>
    </section>
    <section className={`scoreboard players-${game.players.length}`}>
      {game.players.map((player, index) => <article key={player.id} className={`player-card ${index === game.current_player && !winner ? 'active' : ''} ${player.id === game.winner_id ? 'winner' : ''}`}>
        <div className="player-name">{player.name}{player.id === game.winner_id && <span className="winner-mark">Winner</span>}</div>
        <div className="remaining">{player.remaining}</div>
        <div className="statline"><span>{player.visits} visits</span><span>{average(player)} avg</span><span>{player.darts_thrown} darts</span></div>
      </article>)}
    </section>
    {!winner && <section className="control-grid">
      <article className="voice-panel">
        <p className="eyebrow">Speak the score</p>
        <div className="voice-actions"><button className={`mic ${listening ? 'listening' : ''}`} onClick={() => startVoice()} disabled={listening} aria-label="Start voice scoring">{listening ? 'Listening…' : '🎙 Start listening'}</button><button className={`always-mic ${alwaysListening ? 'enabled' : ''}`} onClick={toggleAlwaysListening}>{alwaysListening ? '■ Stop always listening' : '◉ Always listening'}</button></div>
        <p>Try “one hundred and forty” or “triple twenty triple twenty bull”. Press X for push-to-talk. Always listening resumes when Chrome or Edge pauses.</p>
        {pending && <div className="pending"><strong>Heard: {pendingText}</strong><button onClick={() => void submit(pending)}>Use this score</button><button className="quiet" onClick={() => setPending(null)}>Correct it</button></div>}
      </article>
      <article className="entry-panel">
        <p className="eyebrow">Manual score</p>
        <form onSubmit={submitTotal} className="total-form"><input aria-label="Visit total" type="number" min="0" max="180" placeholder="0–180" value={total} onChange={(event) => setTotal(event.target.value)} /><button type="submit">Apply visit</button></form>
        <form onSubmit={submitDarts} className="dart-form"><input aria-label="Dart calls" value={dartText} onChange={(event) => setDartText(event.target.value)} placeholder="e.g. double 20, bull" /><button type="submit">Apply darts</button></form>
      </article>
      <article className="checkout-panel"><p className="eyebrow">Checkout route</p><strong>{checkout || suggestion || 'Not on a finish'}</strong><p>Routes end on a double. Total-only voice checkouts are trusted.</p></article>
    </section>}
    {winner && <section className="finish-card"><h2>Game shot.</h2><p>{winner.name} takes it with a {average(winner)} three-dart average.</p><button onClick={reset}>Start another 501</button></section>}
    <section className="turns-section"><div className="section-title"><div><p className="eyebrow">Scoreboard history</p><h2>Visits</h2></div><button className="quiet" disabled={!lastTurn} onClick={undo}>↶ Undo last</button></div>
      {game.turns.length === 0 ? <p className="empty">No visits yet. Game on.</p> : <ol className="turn-list">{[...game.turns].reverse().map((turn, index) => <li key={`${turn.player_id}-${game.turns.length - index}`}><span>{turn.player_name}</span><strong>{turn.outcome === 'bust' ? 'BUST' : turn.score}</strong><span>{turn.remaining_after} left</span><em>{turn.entry.kind === 'darts' ? turn.entry.darts?.map((dart) => dart.label).join(', ') : 'Visit total'}</em></li>)}</ol>}
    </section>
  </main>
}

function Setup({ playerCount, setPlayerCount, names, setNames, onStart, onHistory }: { playerCount: number; setPlayerCount: (count: number) => void; names: string[]; setNames: (names: string[]) => void; onStart: (event: FormEvent) => void; onHistory: () => void }) {
  return <main className="setup-shell"><nav><button className="brand">AUTO <span>OCHE</span></button><button className="quiet" onClick={onHistory}>Match history</button></nav><section className="setup-card"><p className="eyebrow">Voice-assisted darts scoring</p><h1>Throw. Speak. Score.</h1><p className="lead">A clean 501 scorer for the oche. Chrome and Edge can hear your score; every browser can keep the game moving.</p><form onSubmit={onStart}><fieldset><legend>Players</legend><div className="mode-toggle"><button type="button" className={playerCount === 1 ? 'selected' : ''} onClick={() => setPlayerCount(1)}>Solo</button><button type="button" className={playerCount === 2 ? 'selected' : ''} onClick={() => setPlayerCount(2)}>Vs</button></div></fieldset>{Array.from({ length: playerCount }, (_, index) => <label key={index}>Player {index + 1}<input value={names[index]} onChange={(event) => { const next = [...names]; next[index] = event.target.value; setNames(next) }} maxLength={24} /></label>)}<div className="rules"><span>501</span><span>Double out</span><span>Local play</span></div><button className="primary start" type="submit">Start game</button></form></section></main>
}

function HistoryView({ history, onBack, onClear }: { history: HistoryItem[]; onBack: () => void; onClear: () => void }) {
  return <main className="app-shell"><header className="topbar"><button className="brand" onClick={onBack}>AUTO <span>OCHE</span></button><button className="quiet" onClick={onBack}>Back to game</button></header><section className="game-header"><p className="eyebrow">Stored on this device</p><h1>Match history</h1></section><section className="turns-section">{history.length === 0 ? <p className="empty">No completed matches yet.</p> : <><ol className="history-list">{history.map((match) => <li key={match.id}><div><strong>{match.winner} won</strong><span>{new Date(match.finishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span></div><div>{match.players.map((player) => <span key={player.name}>{player.name}: {player.average} avg · {player.visits} visits</span>)}</div></li>)}</ol><button className="quiet danger" onClick={() => { if (window.confirm('Clear all saved match history?')) onClear() }}>Clear history</button></>}</section></main>
}
