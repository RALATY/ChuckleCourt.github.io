const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_DIR = path.join(__dirname, "public");

const rooms = new Map();
const roomSockets = new Map();

const normalPrompts = [
  "What would your browser history say if it had to introduce you at a wedding?",
  "What is the worst possible slogan for a school cafeteria?",
  "What tiny inconvenience deserves a dramatic villain monologue?",
  "What would be the dumbest reason to get banned from a museum?",
  "What is a terrible thing to whisper before a job interview?",
  "What would your sleep schedule plead guilty to in court?",
  "What is the most suspicious thing someone could name their Wi-Fi?",
  "What would be the worst final line in a breakup text?",
  "What is the fakest excuse for missing a group project meeting?",
  "What should never be said while holding a microphone?",
  "What would be the worst feature to add to a smart fridge?",
  "What is the most cursed fortune cookie message?",
  "What would a haunted printer scream at midnight?",
  "What would be the least inspiring motivational poster?",
  "What is the weirdest hill for someone to confidently die on?",
  "What would be the worst thing to hear from your dentist?",
  "What secret does every shopping cart know?",
  "What would a dramatic apology from a sock sound like?",
  "What is a bad name for a therapist's podcast?",
  "What would make a first date instantly feel like a board meeting?",
  "What fake crime should be added to the legal system?",
  "What would be the most embarrassing thing for a superhero to be sponsored by?",
  "What is the worst possible thing to write on a cake?",
  "What should nobody say after opening a mysterious basement door?",
  "What is a red flag that only appears in group chats?"
];

const miniPrompts = {
  captions: [
    "A wizard gets fired from a bowling alley.",
    "A suspicious briefcase starts giving life advice.",
    "A luxury hotel for people who forgot why they walked into a room.",
    "A press conference about a sandwich scandal.",
    "A haunted elevator that only goes to mildly disappointing places.",
    "A superhero whose only power is making meetings longer."
  ],
  advice: [
    "Someone accidentally replied-all to a company email with 'lol no'.",
    "Your roommate has declared the fridge an independent nation.",
    "A friend wants to impress their crush with a tax spreadsheet.",
    "Your phone autocorrected 'thanks' to 'threats' for three years.",
    "Your boss asked for ideas and you only have conspiracy theories.",
    "Your neighbor is training for the Olympics by vacuuming at 2 AM."
  ],
  brands: [
    ["emotional support stapler", "people who clap when the plane lands"],
    ["premium tap water", "former gifted kids"],
    ["haunted yoga mat", "coworkers who say 'quick sync'"],
    ["luxury pocket lint", "villains with scheduling conflicts"],
    ["self-aware vending machine", "people banned from karaoke"],
    ["tiny courtroom gavel", "group chat lurkers"]
  ],
  forbidden: [
    ["a microwave with an ego", "heat"],
    ["a dentist who became a DJ", "teeth"],
    ["a gym membership you forgot about", "sweat"],
    ["an alarm clock with trust issues", "wake"],
    ["a suspicious salad", "green"],
    ["a chair that thinks it is famous", "sit"]
  ],
  court: [
    "a printer that ate the final essay",
    "a couch that keeps stealing coins",
    "a calendar that keeps inventing Mondays",
    "a password reset email with attitude",
    "a vending machine accused of emotional damage",
    "a group project slide deck with one font too many"
  ],
  apologies: [
    "the moon for ghosting everyone during the day",
    "a calendar invite that said 'optional' but lied",
    "a sandwich for falling apart in public",
    "a keyboard for typing 'regards' with threatening energy",
    "a hotel pillow for being decorative and useless",
    "a phone battery for vanishing at 12 percent"
  ],
  mailbagSeeds: [
    "What question would ruin a peaceful dinner?",
    "What should nobody ask their future self?",
    "What question sounds polite but starts chaos?",
    "What would you ask a cursed vending machine?",
    "What question belongs in a courtroom for snacks?",
    "What would expose someone as secretly a spreadsheet?"
  ]
};

const minigames = [
  {
    id: "mystery-mailbag",
    title: "Mystery Mailbag",
    kind: "questionAnswer",
    blurb: "Write a question. Someone else answers it. Vote on the funniest pair.",
    scoreMode: "split",
    questionSeed: () => pick(miniPrompts.mailbagSeeds)
  },
  {
    // renamed to something clearly distinct from the photo minigame
    id: "caption-mayhem",
    title: "Caption Mayhem",
    kind: "singleAnswer",
    anonymous: false,
    blurb: "Write a caption for a ridiculous scene.",
    prompt: () => `Caption this disaster: ${pick(miniPrompts.captions)}`
  },
  {
    // dedicated photo-focused minigame that photoOnly should prefer
    id: "caption-clash",
    title: "Caption Clash",
    kind: "singleAnswer",
    anonymous: false,
    blurb: "(Photo) Write a caption for the shown image.",
    // For now this uses the same caption prompt seed; the client-side caption-clash
    // static page can be used for a richer photo-based experience. This id is used
    // so room.settings.photoOnly can prefer this minigame.
    prompt: () => `Caption this disaster: ${pick(miniPrompts.captions)}`
  },
  {
    id: "bad-advice-hotline",
    title: "Bad Advice Hotline",
    kind: "singleAnswer",
    anonymous: false,
    blurb: "Give the worst advice that still sounds confident.",
    prompt: () => `A caller needs help: ${pick(miniPrompts.advice)} What is your worst advice?`
  },
  {
    id: "brand-crimes",
    title: "Brand Crimes",
    kind: "singleAnswer",
    anonymous: false,
    blurb: "Pitch a terrible product to a cursed audience.",
    prompt: () => {
      const [product, audience] = pick(miniPrompts.brands);
      return `Pitch "${product}" to ${audience}. Give it a slogan.`;
    }
  },
  {
    id: "forbidden-word",
    title: "Forbidden Word Roast",
    kind: "singleAnswer",
    anonymous: true,
    blurb: "Roast the target without using the forbidden word.",
    prompt: () => {
      const [target, forbidden] = pick(miniPrompts.forbidden);
      return {
        text: `Roast ${target}. Do not use the forbidden word: "${forbidden}".`,
        meta: { forbidden }
      };
    },
    validate: (text, meta) => {
      const forbidden = String(meta.forbidden || "").toLowerCase();
      return !text.toLowerCase().includes(forbidden);
    },
    invalidReason: (meta) => `Used the forbidden word "${meta.forbidden}".`
  },
  {
    id: "chaos-court",
    title: "Chaos Court",
    kind: "singleAnswer",
    anonymous: false,
    blurb: "Defend the indefensible in one dramatic sentence.",
    prompt: () => `Defend this accused menace: ${pick(miniPrompts.court)}.`
  },
  {
    id: "fake-apology",
    title: "Fake Apology Notes",
    kind: "singleAnswer",
    anonymous: true,
    blurb: "Write the official apology nobody asked for.",
    prompt: () => `Write a public apology from ${pick(miniPrompts.apologies)}.`
  }
];

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function id(size = 12) {
  return crypto.randomBytes(size).toString("base64url");
}

function roomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  if (rooms.has(code)) return roomCode();
  return code;
}

function clampText(value, max = 180) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function makePlayer(input, host = false) {
  return {
    id: input.playerId || id(10),
    name: clampText(input.name, 24) || randomName(),
    avatar: clampText(input.avatar, 24) || "spark",
    color: /^#[0-9a-fA-F]{6}$/.test(input.color || "") ? input.color : "#ff6b6b",
    score: 0,
    host,
    connected: false,
    joinedAt: Date.now()
  };
}

function randomName() {
  return pick(["Waffle Lawyer", "Drama Stapler", "Tiny Judge", "Panic Button", "Jazz Receipt", "Sauce Wizard"]);
}

function createRoom(input) {
  const code = roomCode();
  const player = makePlayer(input, true);
  const room = {
    code,
    hostId: player.id,
    players: new Map([[player.id, player]]),
    settings: {
      minigamesEnabled: input.minigamesEnabled !== false,
      photoOnly: input.photoOnly === true || false
    },
    phase: "lobby",
    mainRound: 0,
    totalMainRounds: 6,
    miniCount: 0,
    usedMinigames: [],
    rounds: [],
    currentRoundId: null,
    createdAt: Date.now()
  };
  rooms.set(code, room);
  roomSockets.set(code, new Set());
  return { room, player };
}

function joinRoom(code, input) {
  const room = rooms.get(String(code || "").toUpperCase());
  if (!room) throw httpError(404, "Room not found.");
  if (room.phase !== "lobby" && !room.players.has(input.playerId)) {
    throw httpError(409, "That game already started.");
  }
  let player = input.playerId ? room.players.get(input.playerId) : null;
  if (player) {
    updateProfile(player, input);
  } else {
    player = makePlayer(input, false);
    room.players.set(player.id, player);
  }
  return { room, player };
}

function updateProfile(player, input) {
  const nextName = clampText(input.name, 24);
  const nextAvatar = clampText(input.avatar, 24);
  if (nextName) player.name = nextName;
  if (nextAvatar) player.avatar = nextAvatar;
  if (/^#[0-9a-fA-F]{6}$/.test(input.color || "")) player.color = input.color;
}

function requireRoomAndPlayer(body) {
  const code = String(body.roomCode || "").toUpperCase();
  const room = rooms.get(code);
  if (!room) throw httpError(404, "Room not found.");
  const player = room.players.get(body.playerId);
  if (!player) throw httpError(403, "Player not found in this room.");
  return { room, player };
}

function requireHost(room, player) {
  if (room.hostId !== player.id) throw httpError(403, "Only the host can do that.");
}

function connectedPlayers(room) {
  return Array.from(room.players.values());
}

function startGame(room) {
  room.phase = "playing";
  room.mainRound = 0;
  room.miniCount = 0;
  room.usedMinigames = [];
  room.rounds = [];
  room.currentRoundId = null;
  for (const player of room.players.values()) player.score = 0;
  startNormalRound(room);
}

function startNormalRound(room) {
  room.mainRound += 1;
  const round = {
    id: id(8),
    type: "normal",
    title: `Round ${room.mainRound}`,
    stage: "answering",
    prompt: pick(normalPrompts),
    answers: [],
    votes: {},
    scoring: "winner100",
    createdAt: Date.now()
  };
  room.rounds.push(round);
  room.currentRoundId = round.id;
}

function startMiniRound(room) {
  let game;
  if (room.settings && room.settings.photoOnly) {
    // prefer the dedicated photo minigame (caption-clash)
    game = minigames.find((g) => g.id === "caption-clash") || pick(minigames);
  } else {
    const available = minigames.filter((g) => !room.usedMinigames.includes(g.id));
    game = pick(available.length ? available : minigames);
  }
  room.usedMinigames.push(game.id);
  room.miniCount += 1;

  const promptResult = game.kind === "questionAnswer" ? game.questionSeed() : game.prompt();
  const promptText = typeof promptResult === "string" ? promptResult : promptResult.text;
  const meta = typeof promptResult === "string" ? {} : promptResult.meta || {};

  const round = {
    id: id(8),
    type: "mini",
    miniId: game.id,
    title: game.title,
    blurb: game.blurb,
    stage: game.kind === "questionAnswer" ? "questioning" : "answering",
    kind: game.kind,
    anonymous: Boolean(game.anonymous || game.kind === "questionAnswer"),
    prompt: promptText,
    meta,
    questions: [],
    assignments: {},
    answers: [],
    pairs: [],
    votes: {},
    scoring: game.scoreMode === "split" ? "split50" : "winner100",
    createdAt: Date.now()
  };

  room.rounds.push(round);
  room.currentRoundId = round.id;
}

function currentRound(room) {
  return room.rounds.find((round) => round.id === room.currentRoundId) || null;
}

function submit(room, player, body) {
  const round = currentRound(room);
  if (!round) throw httpError(409, "No active round.");
  const text = clampText(body.text, 220);
  if (!text) throw httpError(400, "Write something first.");

  if (round.kind === "questionAnswer" && round.stage === "questioning") {
    const existing = round.questions.find((question) => question.playerId === player.id);
    if (existing) {
      existing.text = text;
    } else {
      round.questions.push({ id: id(8), playerId: player.id, text, createdAt: Date.now() });
    }
    if (allPlayersSubmitted(room, round.questions)) assignQuestions(room, round);
    return;
  }

  if (round.stage !== "answering") throw httpError(409, "This round is not accepting answers.");

  if (round.kind === "questionAnswer") {
    const assignment = round.assignments[player.id];
    if (!assignment) throw httpError(409, "No question assignment found.");
    const existing = round.pairs.find((pair) => pair.answerPlayerId === player.id);
    if (existing) {
      existing.answer = text;
    } else {
      round.pairs.push({
        id: id(8),
        questionId: assignment.questionId,
        questionPlayerId: assignment.questionPlayerId,
        answerPlayerId: player.id,
        question: assignment.question,
        answer: text,
        flagged: false,
        createdAt: Date.now()
      });
    }
    if (allPlayersAnsweredPairs(room, round)) goVoting(room, round);
    return;
  }

  const game = minigames.find((item) => item.id === round.miniId);
  const valid = game && typeof game.validate === "function" ? game.validate(text, round.meta) : true;
  const invalidReason = valid || !game || typeof game.invalidReason !== "function" ? "" : game.invalidReason(round.meta);
  const existing = round.answers.find((answer) => answer.playerId === player.id);
  if (existing) {
    existing.text = text;
    existing.valid = valid;
    existing.invalidReason = invalidReason;
  } else {
    round.answers.push({
      id: id(8),
      playerId: player.id,
      text,
      flagged: false,
      valid,
      invalidReason,
      createdAt: Date.now()
    });
  }
  if (allPlayersSubmitted(room, round.answers)) goVoting(room, round);
}

function allPlayersSubmitted(room, submissions) {
  return connectedPlayers(room).every((player) => submissions.some((item) => item.playerId === player.id));
}

function allPlayersAnsweredPairs(room, round) {
  return connectedPlayers(room).every((player) => round.pairs.some((pair) => pair.answerPlayerId === player.id));
}

function assignQuestions(room, round) {
  const players = connectedPlayers(room);
  const questions = [...round.questions];
  const shuffledQuestions = shuffle(questions);

  const assignments = {};
  for (let i = 0; i < players.length; i += 1) {
    let question = shuffledQuestions[i % shuffledQuestions.length];
    if (players.length > 1 && question.playerId === players[i].id) {
      const swapIndex = (i + 1) % shuffledQuestions.length;
      const swap = shuffledQuestions[swapIndex];
      shuffledQuestions[swapIndex] = question;
      shuffledQuestions[i] = swap;
      question = shuffledQuestions[i];
    }
    assignments[players[i].id] = {
      questionId: question.id,
      questionPlayerId: question.playerId,
      question: question.text
    };
  }

  round.assignments = assignments;
  round.stage = "answering";
}

function shuffle(list) {
  return list
    .map((item) => ({ item, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map((entry) => entry.item);
}

function goVoting(room, round) {
  round.stage = "voting";
  round.votes = {};
  recomputeScores(room);
}

function submitVote(room, player, body) {
  const round = currentRound(room);
  if (!round || round.stage !== "voting") throw httpError(409, "Voting is not open.");
  const targetId = String(body.targetId || "");
  const options = voteOptionsFor(round, player.id);
  if (!options.some((option) => option.id === targetId)) throw httpError(400, "That option cannot be voted for.");
  round.votes[player.id] = targetId;
  if (allEligibleVotesIn(room, round)) {
    round.stage = "results";
    recomputeScores(room);
  }
}

function voteOptionsFor(round, playerId) {
  if (round.kind === "questionAnswer") {
    return round.pairs.filter((pair) => !pair.flagged);
  }
  return round.answers.filter((answer) => !answer.flagged && answer.valid !== false && answer.playerId !== playerId);
}

function allEligibleVotesIn(room, round) {
  return connectedPlayers(room).every((player) => {
    const options = voteOptionsFor(round, player.id);
    return options.length === 0 || Boolean(round.votes[player.id]);
  });
}

function flagOption(room, targetId) {
  const round = currentRound(room);
  if (!round || !["voting", "results"].includes(round.stage)) throw httpError(409, "Nothing can be removed right now.");
  const collection = round.kind === "questionAnswer" ? round.pairs : round.answers;
  const option = collection.find((item) => item.id === targetId);
  if (!option) throw httpError(404, "Answer not found.");
  option.flagged = true;
  for (const [voterId, votedId] of Object.entries(round.votes)) {
    if (votedId === targetId) delete round.votes[voterId];
  }
  if (round.stage === "results" || allEligibleVotesIn(room, round)) {
    round.stage = "results";
  }
  recomputeScores(room);
}

function nextStep(room) {
  const round = currentRound(room);
  if (!round || round.stage !== "results") throw httpError(409, "Finish the current round first.");

  if (room.settings.minigamesEnabled && round.type === "normal" && room.mainRound % 2 === 0) {
    startMiniRound(room);
    return;
  }

  if (room.mainRound < room.totalMainRounds) {
    startNormalRound(room);
    return;
  }

  room.phase = "final";
  room.currentRoundId = null;
  recomputeScores(room);
}

function restartRoom(room) {
  room.phase = "lobby";
  room.mainRound = 0;
  room.miniCount = 0;
  room.usedMinigames = [];
  room.rounds = [];
  room.currentRoundId = null;
  for (const player of room.players.values()) player.score = 0;
}

function recomputeScores(room) {
  const totals = {};
  for (const player of room.players.values()) totals[player.id] = 0;

  for (const round of room.rounds) {
    if (!["results"].includes(round.stage) && room.phase !== "final") continue;
    const voteCounts = {};
    for (const targetId of Object.values(round.votes || {})) {
      voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
    }

    if (round.kind === "questionAnswer") {
      for (const pair of round.pairs) {
        if (pair.flagged) continue;
        const votes = voteCounts[pair.id] || 0;
        totals[pair.questionPlayerId] = (totals[pair.questionPlayerId] || 0) + votes * 50;
        totals[pair.answerPlayerId] = (totals[pair.answerPlayerId] || 0) + votes * 50;
      }
    } else {
      for (const answer of round.answers) {
        if (answer.flagged || answer.valid === false) continue;
        const votes = voteCounts[answer.id] || 0;
        totals[answer.playerId] = (totals[answer.playerId] || 0) + votes * 100;
      }
    }
  }

  for (const player of room.players.values()) player.score = totals[player.id] || 0;
}

function serializeRoom(room, viewerId) {
  recomputeScores(room);
  const players = Array.from(room.players.values())
    .sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt)
    .map((player) => ({
      id: player.id,
      name: player.name,
      avatar: player.avatar,
      color: player.color,
      score: player.score,
      host: room.hostId === player.id,
      connected: player.connected
    }));

  const round = currentRound(room);
  const viewer = room.players.get(viewerId);
  return {
    code: room.code,
    phase: room.phase,
    hostId: room.hostId,
    isHost: viewer ? room.hostId === viewer.id : false,
    settings: room.settings,
    players,
    minPlayers: 2,
    mainRound: room.mainRound,
    totalMainRounds: room.totalMainRounds,
    miniCount: room.miniCount,
    networkOrigins: networkOrigins(),
    currentRound: round ? serializeRound(room, round, viewerId) : null,
    winner: room.phase === "final" ? winners(players) : null,
    updatedAt: Date.now()
  };
}

function networkOrigins() {
  const origins = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) {
        origins.push(`http://${entry.address}:${PORT}`);
      }
    }
  }
  return [...new Set(origins)];
}

function serializeRound(room, round, viewerId) {
  const base = {
    id: round.id,
    type: round.type,
    miniId: round.miniId || null,
    title: round.title,
    blurb: round.blurb || "",
    stage: round.stage,
    kind: round.kind || "singleAnswer",
    anonymous: round.anonymous || false,
    prompt: round.prompt,
    meta: round.meta || {},
    submitted: submittedForViewer(round, viewerId),
    vote: round.votes ? round.votes[viewerId] || "" : "",
    results: resultsFor(round, room, viewerId)
  };

  if (round.kind === "questionAnswer") {
    base.myAssignment = round.assignments[viewerId] || null;
    base.questionCount = round.questions.length;
    base.answerCount = round.pairs.length;
    base.options = round.stage === "voting" || round.stage === "results"
      ? round.pairs.map((pair) => serializePairOption(room, round, pair, viewerId))
      : [];
  } else {
    base.answerCount = round.answers.length;
    base.options = round.stage === "voting" || round.stage === "results"
      ? round.answers.map((answer) => serializeAnswerOption(room, round, answer, viewerId))
      : [];
  }

  return base;
}

function submittedForViewer(round, viewerId) {
  if (round.kind === "questionAnswer" && round.stage === "questioning") {
    return round.questions.some((question) => question.playerId === viewerId);
  }
  if (round.kind === "questionAnswer") {
    return round.pairs.some((pair) => pair.answerPlayerId === viewerId);
  }
  return round.answers.some((answer) => answer.playerId === viewerId);
}

function serializeAnswerOption(room, round, answer, viewerId) {
  const author = room.players.get(answer.playerId);
  const revealAuthor = !round.anonymous && (round.stage === "results" || answer.playerId === viewerId);
  return {
    id: answer.id,
    text: answer.text,
    playerId: answer.playerId,
    authorName: revealAuthor && author ? author.name : "Anonymous",
    authorColor: author ? author.color : "#ffffff",
    authorAvatar: author ? author.avatar : "spark",
    isMine: answer.playerId === viewerId,
    flagged: Boolean(answer.flagged),
    valid: answer.valid !== false,
    invalidReason: answer.invalidReason || "",
    votes: countVotes(round, answer.id),
    canVote: voteOptionsFor(round, viewerId).some((option) => option.id === answer.id)
  };
}

function serializePairOption(room, round, pair, viewerId) {
  const questionAuthor = room.players.get(pair.questionPlayerId);
  const answerAuthor = room.players.get(pair.answerPlayerId);
  const reveal = false;
  return {
    id: pair.id,
    question: pair.question,
    answer: pair.answer,
    questionPlayerId: pair.questionPlayerId,
    answerPlayerId: pair.answerPlayerId,
    questionAuthorName: reveal && questionAuthor ? questionAuthor.name : "Anonymous",
    answerAuthorName: reveal && answerAuthor ? answerAuthor.name : "Anonymous",
    isMine: pair.questionPlayerId === viewerId || pair.answerPlayerId === viewerId,
    flagged: Boolean(pair.flagged),
    votes: countVotes(round, pair.id),
    canVote: voteOptionsFor(round, viewerId).some((option) => option.id === pair.id)
  };
}

function countVotes(round, targetId) {
  return Object.values(round.votes || {}).filter((vote) => vote === targetId).length;
}

function resultsFor(round, room) {
  if (round.stage !== "results") return null;
  const options = round.kind === "questionAnswer" ? round.pairs : round.answers;
  return options
    .filter((option) => !option.flagged && option.valid !== false)
    .map((option) => ({
      id: option.id,
      votes: countVotes(round, option.id),
      points: round.kind === "questionAnswer" ? countVotes(round, option.id) * 50 : countVotes(round, option.id) * 100
    }))
    .sort((a, b) => b.votes - a.votes);
}

function winners(players) {
  const highScore = Math.max(...players.map((player) => player.score), 0);
  return players.filter((player) => player.score === highScore);
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw httpError(400, "Invalid JSON.");
  }
}

function broadcast(room) {
  const sockets = roomSockets.get(room.code);
  if (!sockets) return;
  for (const socket of Array.from(sockets)) {
    const payload = JSON.stringify(serializeRoom(room, socket.playerId));
    socket.res.write(`event: state\ndata: ${payload}\n\n`);
  }
}

function openEvents(req, res, url) {
  const code = String(url.searchParams.get("room") || "").toUpperCase();
  const playerId = String(url.searchParams.get("player") || "");
  const room = rooms.get(code);
  if (!room || !room.players.has(playerId)) {
    res.writeHead(404);
    res.end();
    return;
  }

  const player = room.players.get(playerId);
  player.connected = true;
  const socket = { playerId, res };
  roomSockets.get(code).add(socket);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  res.write(`event: state\ndata: ${JSON.stringify(serializeRoom(room, playerId))}\n\n`);
  broadcast(room);

  req.on("close", () => {
    roomSockets.get(code)?.delete(socket);
    const stillConnected = Array.from(roomSockets.get(code) || []).some((item) => item.playerId === playerId);
    player.connected = stillConnected;
    broadcast(room);
  });
}

function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".svg": "image/svg+xml"
    }[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (req.method === "GET" && url.pathname === "/events") {
      openEvents(req, res, url);
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      if (req.method !== "POST") throw httpError(405, "Use POST.");
      const body = await readBody(req);
      let room;
      let player;

      if (url.pathname === "/api/create") {
        ({ room, player } = createRoom(body));
        sendJson(res, 200, { roomCode: room.code, playerId: player.id, room: serializeRoom(room, player.id) });
        broadcast(room);
        return;
      }

      if (url.pathname === "/api/join") {
        ({ room, player } = joinRoom(body.roomCode, body));
        sendJson(res, 200, { roomCode: room.code, playerId: player.id, room: serializeRoom(room, player.id) });
        broadcast(room);
        return;
      }

      ({ room, player } = requireRoomAndPlayer(body));

      if (url.pathname === "/api/profile") {
        if (room.phase !== "lobby") throw httpError(409, "Profiles can only be changed in the lobby.");
        updateProfile(player, body);
      } else if (url.pathname === "/api/settings") {
        requireHost(room, player);
        if (room.phase !== "lobby") throw httpError(409, "Settings can only be changed before the game starts.");
        if (typeof body.minigamesEnabled !== "undefined") {
          room.settings.minigamesEnabled = body.minigamesEnabled !== false;
        }
        if (typeof body.photoOnly !== "undefined") {
          room.settings.photoOnly = Boolean(body.photoOnly);
        }
      } else if (url.pathname === "/api/start") {
        requireHost(room, player);
        if (room.phase !== "lobby") throw httpError(409, "This game already started.");
        if (room.players.size < 2) throw httpError(409, "You need at least 2 players.");
        startGame(room);
      } else if (url.pathname === "/api/submit") {
        submit(room, player, body);
      } else if (url.pathname === "/api/vote") {
        submitVote(room, player, body);
      } else if (url.pathname === "/api/flag") {
        requireHost(room, player);
        flagOption(room, String(body.targetId || ""));
      } else if (url.pathname === "/api/next") {
        requireHost(room, player);
        nextStep(room);
      } else if (url.pathname === "/api/force-next") {
        requireHost(room, player);
        const round = currentRound(room);
        if (!round) throw httpError(409, "No active round.");
        if (!["questioning", "answering"].includes(round.stage)) throw httpError(409, "Force-next is only allowed during the typing phase.");

        // If in questioning for questionAnswer rounds, assign questions (this moves to answering)
        if (round.kind === "questionAnswer" && round.stage === "questioning") {
          assignQuestions(room, round);
          sendJson(res, 200, { ok: true, room: serializeRoom(room, player.id) });
          broadcast(room);
          return;
        }
        // If in answering, go to voting
        if (round.stage === "answering") {
          goVoting(room, round);
          sendJson(res, 200, { ok: true, room: serializeRoom(room, player.id) });
          broadcast(room);
          return;
        }
      } else if (url.pathname === "/api/kick") {
        requireHost(room, player);
        const targetId = String(body.targetId || "");
        if (!targetId || !room.players.has(targetId)) throw httpError(404, "Player not found.");
        // remove player
        room.players.delete(targetId);
        // close any SSE sockets for that player
        const sockets = roomSockets.get(room.code) || new Set();
        for (const s of Array.from(sockets)) {
          if (s.playerId === targetId) {
            try { s.res.end(); } catch (e) { /* ignore */ }
            sockets.delete(s);
          }
        }
        // remove any submissions the kicked player made in the current round(s)
        for (const round of room.rounds) {
          if (round.answers) {
            round.answers = round.answers.filter(a => a.playerId !== targetId);
          }
          if (round.questions) round.questions = round.questions.filter(q => q.playerId !== targetId);
          if (round.pairs) round.pairs = round.pairs.filter(p => p.answerPlayerId !== targetId && p.questionPlayerId !== targetId);
          // remove votes by kicked player
          if (round.votes) delete round.votes[targetId];
        }
        // If kicked player was host (edge-case), reassign host
        if (room.hostId === targetId) {
          const next = room.players.keys().next();
          room.hostId = next.done ? null : next.value;
        }
        sendJson(res, 200, { ok: true, room: serializeRoom(room, player.id) });
        broadcast(room);
        return;
      } else if (url.pathname === "/api/restart") {
        requireHost(room, player);
        restartRoom(room);
      } else {
        throw httpError(404, "Unknown endpoint.");
      }

      sendJson(res, 200, { ok: true, room: serializeRoom(room, player.id) });
      broadcast(room);
      return;
    }

    serveStatic(req, res, url);
  } catch (error) {
    const status = error.status || 500;
    sendJson(res, status, { error: error.message || "Server error." });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Chuckle Court is listening on http://localhost:${PORT}`);
  for (const origin of networkOrigins()) {
    console.log(`Same Wi-Fi invite base: ${origin}`);
  }
});
