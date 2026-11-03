export type Role = "player" | "spectator";
export type Phase = "lobby" | "writing" | "voting" | "results" | "reveal" | "finished";

export interface Participant {
  id: string;
  name: string;
  role: Role;
}

export interface Submission {
  id: string;
  authorId: string;
  text: string;
  votes: number;
  winning: boolean;
}

export interface Round {
  number: number;
  submissions: Submission[];
  winnerIds: string[];
}

export interface GameState {
  title: string;
  phase: Phase;
  roundNumber: number;
  maxRounds: number;
  secondsPerPhase: number;
  openingLine: string;
  participants: Participant[];
  rounds: Round[];
  currentSubmissions: Submission[];
  currentVotes: Record<string, string>;
  story: Submission[];
  notice: string;
}

export const initialGame: GameState = {
  title: "The Midnight Signal",
  phase: "lobby",
  roundNumber: 1,
  maxRounds: 8,
  secondsPerPhase: 60,
  openingLine: "The strange signal arrived at exactly midnight.",
  participants: [
    { id: "p1", name: "Raven", role: "player" },
    { id: "p2", name: "Byte", role: "player" },
    { id: "p3", name: "Moth", role: "player" },
    { id: "s1", name: "Observer", role: "spectator" }
  ],
  rounds: [],
  currentSubmissions: [],
  currentVotes: {},
  story: [],
  notice: "Add players or spectators, then start the first round."
};

export function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

export function normalizeSentence(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

export function validateSubmission(state: GameState, participantId: string, text: string): string | null {
  const participant = state.participants.find(p => p.id === participantId);
  if (!participant) return "Choose a participant first.";
  if (participant.role !== "player") return "Spectators cannot submit sentences.";
  if (state.phase !== "writing") return "The writing phase is closed.";
  if (state.currentSubmissions.some(s => s.authorId === participantId)) return "This player has already submitted this round.";
  const clean = normalizeSentence(text);
  if (!clean) return "Write a sentence before submitting.";
  if (/[.!?]$/.test(clean) === false) return "Finish your sentence with ., !, or ?";
  if (clean.length > 220) return "Keep the sentence to 220 characters or fewer.";
  return null;
}

export function addSubmission(state: GameState, participantId: string, text: string): GameState {
  const error = validateSubmission(state, participantId, text);
  if (error) return { ...state, notice: error };
  const clean = normalizeSentence(text);
  return {
    ...state,
    currentSubmissions: [...state.currentSubmissions, {
      id: makeId(), authorId: participantId, text: clean, votes: 0, winning: false
    }],
    notice: "Sentence submitted privately. Your identity stays hidden until the final reveal."
  };
}

export function closeWriting(state: GameState): GameState {
  if (state.currentSubmissions.length < 2) {
    return { ...state, notice: "At least two sentences are needed to start voting in this prototype." };
  }
  return { ...state, phase: "voting", notice: "Submissions are locked. Voting is now open." };
}

export function castVote(state: GameState, voterId: string, submissionId: string): GameState {
  if (state.phase !== "voting") return { ...state, notice: "Voting is not open." };
  const voter = state.participants.find(p => p.id === voterId);
  if (!voter) return { ...state, notice: "Choose a participant or spectator identity." };
  if (state.currentVotes[voterId]) return { ...state, notice: "This participant has already voted." };
  const target = state.currentSubmissions.find(s => s.id === submissionId);
  if (!target) return { ...state, notice: "That submission could not be found." };
  if (voter.role === "player" && target.authorId === voterId) {
    return { ...state, notice: "Players cannot vote for their own sentence." };
  }
  const submissions = state.currentSubmissions.map(s =>
    s.id === submissionId ? { ...s, votes: s.votes + 1 } : s
  );
  return {
    ...state,
    currentSubmissions: submissions,
    currentVotes: { ...state.currentVotes, [voterId]: submissionId },
    notice: "Vote recorded. All votes remain anonymous."
  };
}

export function closeVoting(state: GameState): GameState {
  if (state.phase !== "voting") return state;
  if (Object.keys(state.currentVotes).length === 0) {
    return { ...state, notice: "At least one vote is required to resolve this round." };
  }
  const high = Math.max(...state.currentSubmissions.map(s => s.votes));
  const winners = state.currentSubmissions.filter(s => s.votes === high && high > 0);
  const marked = state.currentSubmissions.map(s => ({ ...s, winning: winners.some(w => w.id === s.id) }));
  const round: Round = {
    number: state.roundNumber,
    submissions: marked,
    winnerIds: winners.map(w => w.id)
  };
  return {
    ...state,
    phase: "results",
    currentSubmissions: marked,
    rounds: [...state.rounds, round],
    notice: winners.length > 1 ? "The round is tied. All tied sentences advance." : "Voting is closed. The winning sentence advances."
  };
}

export function advanceOrReveal(state: GameState): GameState {
  const winners = state.currentSubmissions.filter(s => s.winning);
  const newStory = [...state.story, ...winners];
  if (state.roundNumber >= state.maxRounds) {
    return { ...state, story: newStory, phase: "reveal", notice: "The story is complete. Time to reveal the authors!" };
  }
  return {
    ...state,
    story: newStory,
    roundNumber: state.roundNumber + 1,
    phase: "writing",
    currentSubmissions: [],
    currentVotes: {},
    notice: "Next round! Every player may contribute one new sentence."
  };
}

export function finishReveal(state: GameState): GameState {
  return { ...state, phase: "finished", notice: "StoryFuse story complete. Share the story with your server!" };
}

export function getScores(state: GameState): Record<string, number> {
  const scores: Record<string, number> = {};
  state.participants.filter(p => p.role === "player").forEach(p => scores[p.id] = 0);
  state.rounds.forEach(round => {
    round.submissions.filter(s => s.winning).forEach(s => {
      scores[s.authorId] = (scores[s.authorId] ?? 0) + 3;
    });
  });
  return scores;
}
