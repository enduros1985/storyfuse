import { useMemo, useState } from "react";
import DiscordLobby from "./DiscordLobby";
import {
  addSubmission, advanceOrReveal, castVote, closeVoting, closeWriting,
  finishReveal, getScores, initialGame, makeId, type GameState, type Role
} from "./game";

export default function App() {
  const [game, setGame] = useState<GameState>(initialGame);
  const [selectedId, setSelectedId] = useState("p1");
  const [sentence, setSentence] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<Role>("player");
  const [showRules, setShowRules] = useState(false);
  const scores = useMemo(() => getScores(game), [game]);
  const selected = game.participants.find(p => p.id === selectedId);
  const totalVotes = Object.keys(game.currentVotes).length;

  function update(fn: (current: GameState) => GameState) {
    setGame(current => fn(current));
  }

  function addPerson() {
    const name = newName.trim();
    if (!name) return;
    if (game.participants.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      update(s => ({ ...s, notice: "That name is already in this room." }));
      return;
    }
    const person = { id: makeId(), name, role: newRole };
    setGame(s => ({ ...s, participants: [...s.participants, person], notice: `${name} joined as ${newRole}.` }));
    setSelectedId(person.id);
    setNewName("");
  }

  function start() {
    if (game.participants.filter(p => p.role === "player").length < 2) {
      update(s => ({ ...s, notice: "At least two players are required." }));
      return;
    }
    update(s => ({ ...s, phase: "writing", story: [], currentSubmissions: [], currentVotes: {}, rounds: [], roundNumber: 1, notice: "Round 1 is open. Each player may submit one sentence." }));
  }

  function submit() {
    update(s => addSubmission(s, selectedId, sentence));
    setSentence("");
  }

  function reset() {
    setGame(initialGame);
    setSelectedId("p1");
    setSentence("");
  }

  const revealStory = game.story.length ? game.story : [];
  const allSubmissions = game.rounds.flatMap(r => r.submissions);

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">SF</span><div><strong>STORYFUSE</strong><small>THE MULTIPLAYER STORY GAME</small></div></div>
        <div className="top-actions"><span className="pill">PROTOTYPE 0.3</span><button className="ghost" onClick={() => setShowRules(v => !v)}>Game rules</button></div>
      </header>

      <section className="hero">
        <div>
          <div className="eyebrow">ANONYMITY UNTIL THE FINAL REVEAL</div>
          <h1>One story.<br/><em>Many voices.</em></h1>
          <p>Players write one sentence each. The room votes anonymously. The authors are revealed when the story is complete.</p>
          <div className="hero-actions"><button onClick={start} disabled={game.phase !== "lobby"}>Start game <span>→</span></button><button className="secondary" onClick={reset}>Reset demo</button></div>
        </div>
        <div className="signal-card">
          <div className="signal-top"><span className="live-dot"></span> STORY IN PROGRESS <span>#{String(game.roundNumber).padStart(2,"0")}</span></div>
          <div className="signal-line"></div>
          <blockquote>“{game.openingLine}”</blockquote>
          <div className="signal-bottom"><span>CLASSIC MODE</span><span>8 ROUNDS</span><span>60 SEC / ROUND</span></div>
        </div>
      </section>

      <DiscordLobby />

      {showRules && <section className="panel rules"><div className="panel-title"><div><span className="eyebrow">HOW TO PLAY</span><h2>Classic rules</h2></div><button className="icon-btn" onClick={() => setShowRules(false)}>×</button></div><div className="rule-grid"><div><b>01 / WRITE</b><p>Every player submits one sentence per round. Submissions stay anonymous.</p></div><div><b>02 / VOTE</b><p>Players and spectators each get one vote. Players cannot vote for themselves.</p></div><div><b>03 / ADVANCE</b><p>The highest-voted sentence advances. Ties advance all tied sentences.</p></div><div><b>04 / REVEAL</b><p>At the end, every sentence is highlighted with its author's name and winning entries.</p></div></div></section>}

      <section className="game-layout">
        <div className="main-column">
          <section className="panel">
            <div className="panel-title"><div><span className="eyebrow">GAME ROOM / LOCAL DEMO</span><h2>{game.title}</h2></div><span className={`phase phase-${game.phase}`}>{game.phase.toUpperCase()}</span></div>
            <div className="progress"><div style={{width: `${game.roundNumber / game.maxRounds * 100}%`}}></div></div>
            <div className="round-meta"><span>ROUND {game.roundNumber} OF {game.maxRounds}</span><span>{game.secondsPerPhase}s PHASE TIMER · DEMO TIMER NOT RUNNING</span></div>
            <div className="story-so-far"><span className="eyebrow">STORY SO FAR</span><p>{game.openingLine}</p>{game.story.map((s,i) => <p key={s.id} className="story-line">{s.text}</p>)}</div>
          </section>

          {game.phase === "lobby" && <section className="panel">
            <div className="panel-title"><div><span className="eyebrow">BEFORE THE FIRST SENTENCE</span><h2>Room lobby</h2></div><span className="count">{game.participants.length} in room</span></div>
            <div className="participant-list">{game.participants.map(p => <div className="participant" key={p.id}><span className="avatar">{p.name.slice(0,1).toUpperCase()}</span><span className="person-name">{p.name}</span><span className={`role role-${p.role}`}>{p.role}</span></div>)}</div>
            <div className="add-person"><input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Add a demo participant" onKeyDown={e => e.key === "Enter" && addPerson()}/><select value={newRole} onChange={e => setNewRole(e.target.value as Role)}><option value="player">Player</option><option value="spectator">Spectator</option></select><button onClick={addPerson}>Add</button></div>
            <p className="hint">This local prototype simulates multiple identities on one device. A real Discord Activity will use each member's Discord identity.</p>
          </section>}

          {game.phase === "writing" && <section className="panel">
            <div className="panel-title"><div><span className="eyebrow">ROUND {game.roundNumber} / WRITE</span><h2>Add to the story</h2></div><span className="count">{game.currentSubmissions.length} / {game.participants.filter(p=>p.role==="player").length} submitted</span></div>
            <label className="field-label">Acting as</label>
            <select className="full-select" value={selectedId} onChange={e => setSelectedId(e.target.value)}>{game.participants.map(p => <option key={p.id} value={p.id}>{p.name} · {p.role}</option>)}</select>
            <label className="field-label">Your one sentence</label>
            <textarea value={sentence} onChange={e => setSentence(e.target.value)} placeholder="What happens next?" maxLength={220} rows={3}/>
            <div className="form-foot"><span>{sentence.length}/220 characters · End with ., ! or ?</span><button onClick={submit} disabled={!sentence.trim()}>Submit anonymously ↗</button></div>
            <div className="submission-status"><b>{game.currentSubmissions.length} SENTENCES RECEIVED</b><div className="submission-chips">{game.currentSubmissions.map((s,i)=><span key={s.id}>ENTRY {String(i+1).padStart(2,"0")} ✓</span>)}</div></div>
            <div className="button-row"><button className="secondary" onClick={() => update(closeWriting)}>Lock submissions & vote</button></div>
          </section>}

          {game.phase === "voting" && <section className="panel">
            <div className="panel-title"><div><span className="eyebrow">ROUND {game.roundNumber} / VOTE</span><h2>Choose the next line</h2></div><span className="count">{totalVotes} votes cast</span></div>
            <label className="field-label">Voting as</label>
            <select className="full-select" value={selectedId} onChange={e => setSelectedId(e.target.value)}>{game.participants.map(p => <option key={p.id} value={p.id}>{p.name} · {p.role}</option>)}</select>
            <div className="vote-list">{game.currentSubmissions.map((s,i)=>{const author=game.participants.find(p=>p.id===s.authorId);const own=selected?.role==="player" && s.authorId===selectedId;const already=Boolean(game.currentVotes[selectedId]);return <article className="vote-card" key={s.id}><div className="vote-number">ENTRY {String(i+1).padStart(2,"0")}</div><p>{s.text}</p><div className="vote-foot"><span>{own?"YOUR SUBMISSION": "AUTHOR HIDDEN"}</span><button disabled={already || own} onClick={()=>update(g=>castVote(g,selectedId,s.id))}>{already?"VOTE RECORDED":own?"CANNOT SELF-VOTE":"Vote for this ↗"}</button></div>{game.phase==="voting" && author?.id===selectedId && <small className="hint">You cannot vote for your own sentence.</small>}</article>})}</div>
            <div className="button-row"><button className="secondary" onClick={() => update(closeVoting)}>Close voting & reveal round result</button></div>
          </section>}

          {game.phase === "results" && <section className="panel">
            <div className="panel-title"><div><span className="eyebrow">ROUND {game.roundNumber} / RESULT</span><h2>The room has voted</h2></div><span className="phase phase-results">VOTING CLOSED</span></div>
            <p className="hint">Authors are still hidden. The author reveal happens only after the final round.</p>
            {game.currentSubmissions.slice().sort((a,b)=>b.votes-a.votes).map((s,i)=><div className={`result-row ${s.winning?"winner":""}`} key={s.id}><div><span className="eyebrow">ENTRY {i+1} {s.winning?"· ADVANCES":""}</span><p>{s.text}</p></div><strong>{s.votes} <small>votes</small></strong></div>)}
            <div className="button-row"><button onClick={()=>update(advanceOrReveal)}>{game.roundNumber===game.maxRounds?"Finish story & reveal authors":"Start next round →"}</button></div>
          </section>}

          {(game.phase === "reveal" || game.phase === "finished") && <section className="panel">
            <div className="panel-title"><div><span className="eyebrow">THE FINAL REVEAL</span><h2>{game.phase==="finished"?"Story complete":"Who wrote what?"}</h2></div><span className="phase phase-finished">AUTHORS REVEALED</span></div>
            <div className="reveal-story"><p className="opening">{game.openingLine}</p>{revealStory.map((s,i)=>{const author=game.participants.find(p=>p.id===s.authorId);return <article className={`reveal-line ${s.winning?"winner":""}`} key={s.id}><p>{s.text}</p><div><span>{author?.name ?? "Unknown author"}</span>{s.winning&&<b>WINNING SENTENCE</b>}</div></article>})}</div>
            <h3>Final standings</h3>
            <div className="leaderboard">{game.participants.filter(p=>p.role==="player").sort((a,b)=>(scores[b.id]??0)-(scores[a.id]??0)).map((p,i)=><div className="leader" key={p.id}><span>{i+1}. {p.name}</span><strong>{scores[p.id]??0} pts</strong></div>)}</div>
            <div className="button-row"><button onClick={()=>update(finishReveal)}>Complete game</button><button className="secondary" onClick={reset}>New demo game</button></div>
          </section>}
        </div>

        <aside className="side-column">
          <section className="panel compact"><span className="eyebrow">ROOM STATUS</span><div className="stat"><strong>{game.participants.filter(p=>p.role==="player").length}</strong><span>PLAYERS</span></div><div className="stat"><strong>{game.participants.filter(p=>p.role==="spectator").length}</strong><span>SPECTATORS</span></div><div className="stat"><strong>{game.maxRounds}</strong><span>ROUNDS</span></div></section>
          <section className="panel compact"><span className="eyebrow">GAME NOTICE</span><p className="notice">{game.notice}</p></section>
          <section className="panel compact"><span className="eyebrow">SCORING</span><p className="small-copy">Each winning sentence earns its author 3 points. Spectators can vote but do not earn writing points. Tied winning sentences each advance.</p></section>
          <section className="panel compact"><span className="eyebrow">COMING NEXT</span><div className="coming">Discord Activity integration</div><div className="coming">Server-wide room discovery</div><div className="coming">Saved story archive</div><div className="coming">Optional game modes</div></section>
        </aside>
      </section>
      <footer><span>STORYFUSE © PROTOTYPE CONCEPT</span><span>ANONYMITY DURING PLAY · RECOGNITION AT THE END</span></footer>
    </main>
  );
}
