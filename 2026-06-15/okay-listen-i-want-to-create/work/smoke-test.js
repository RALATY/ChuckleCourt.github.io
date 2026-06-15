const assert = require("assert");

const base = "http://localhost:3000";

async function post(path, body) {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`${path} failed: ${data.error || response.status}`);
  }
  return data;
}

async function playNormal(roomCode, hostId, secondId, roundNumber) {
  await post("/api/submit", {
    roomCode,
    playerId: hostId,
    text: `Host answer ${roundNumber}: a spreadsheet wearing sunglasses.`
  });
  const afterSecondSubmit = await post("/api/submit", {
    roomCode,
    playerId: secondId,
    text: `Second answer ${roundNumber}: a microwave with a podcast.`
  });

  const round = afterSecondSubmit.room.currentRound;
  assert.equal(round.stage, "voting");
  const hostAnswer = round.options.find((option) => option.playerId === hostId);
  const secondAnswer = round.options.find((option) => option.playerId === secondId);
  assert(hostAnswer && secondAnswer, "both normal answers should be vote options");

  await post("/api/vote", { roomCode, playerId: hostId, targetId: secondAnswer.id });
  const result = await post("/api/vote", { roomCode, playerId: secondId, targetId: hostAnswer.id });
  assert.equal(result.room.currentRound.stage, "results");
  return result.room;
}

async function main() {
  const created = await post("/api/create", {
    name: "Host Judge",
    avatar: "crown",
    color: "#ff6b6b"
  });
  const roomCode = created.roomCode;
  const hostId = created.playerId;

  const joined = await post("/api/join", {
    roomCode,
    name: "Second Banana",
    avatar: "bolt",
    color: "#54d6a6"
  });
  const secondId = joined.playerId;

  await post("/api/start", { roomCode, playerId: hostId });
  let room = await playNormal(roomCode, hostId, secondId, 1);
  assert.deepEqual(room.players.map((player) => player.score).sort((a, b) => a - b), [100, 100]);

  await post("/api/next", { roomCode, playerId: hostId });
  room = await playNormal(roomCode, hostId, secondId, 2);
  assert.deepEqual(room.players.map((player) => player.score).sort((a, b) => a - b), [200, 200]);

  const miniStart = await post("/api/next", { roomCode, playerId: hostId });
  assert.equal(miniStart.room.currentRound.miniId, "mystery-mailbag");
  assert.equal(miniStart.room.currentRound.stage, "questioning");

  await post("/api/submit", {
    roomCode,
    playerId: hostId,
    text: "What would ruin a peaceful brunch instantly?"
  });
  const questionsDone = await post("/api/submit", {
    roomCode,
    playerId: secondId,
    text: "What question should a suspicious vending machine ask?"
  });
  assert.equal(questionsDone.room.currentRound.stage, "answering");

  await post("/api/submit", {
    roomCode,
    playerId: hostId,
    text: "A tiny invoice for emotional damages."
  });
  const answersDone = await post("/api/submit", {
    roomCode,
    playerId: secondId,
    text: "The soup has requested legal counsel."
  });
  assert.equal(answersDone.room.currentRound.stage, "voting");
  assert.equal(answersDone.room.currentRound.options.length, 2);

  const [firstPair, secondPair] = answersDone.room.currentRound.options;
  await post("/api/vote", { roomCode, playerId: hostId, targetId: firstPair.id });
  const miniResult = await post("/api/vote", { roomCode, playerId: secondId, targetId: secondPair.id });
  assert.equal(miniResult.room.currentRound.stage, "results");
  const serialized = JSON.stringify(miniResult.room.currentRound.options);
  assert(!serialized.includes("Host Judge"), "anonymous pair should not reveal host name");
  assert(!serialized.includes("Second Banana"), "anonymous pair should not reveal second player name");
  assert.deepEqual(miniResult.room.players.map((player) => player.score).sort((a, b) => a - b), [300, 300]);

  console.log(JSON.stringify({
    roomCode,
    hostId,
    secondId,
    phase: miniResult.room.phase,
    round: miniResult.room.currentRound.title,
    scores: miniResult.room.players.map((player) => ({ name: player.name, score: player.score }))
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
