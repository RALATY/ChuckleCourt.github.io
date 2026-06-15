const app = document.querySelector("#app");
const speechTemplate = document.querySelector("#speech-template");

const avatars = ["spark", "bolt", "crown", "mug", "comet", "mask", "sock", "boom"];
const colors = ["#ff6b6b", "#54d6a6", "#54b7ff", "#ffd166", "#7c5cff", "#ff9f43", "#2dd4bf", "#f472b6"];

const state = {
  screen: "home",
  room: null,
  roomCode: localStorage.getItem("cc_room") || "",
  playerId: localStorage.getItem("cc_player") || "",
  profile: {
    name: localStorage.getItem("cc_name") || "",
    avatar: localStorage.getItem("cc_avatar") || "spark",
    color: localStorage.getItem("cc_color") || "#ff6b6b"
  },
  source: null,
  toast: "",
  confettiOn: false,
  // draft holds the user's in-progress textarea value so server-driven re-renders don't wipe it
  draft: ""
};

const params = new URLSearchParams(location.search);
if (params.get("room")) {
  state.roomCode = params.get("room").toUpperCase();
  state.screen = "join";
}

function saveProfile() {
  localStorage.setItem("cc_name", state.profile.name);
  localStorage.setItem("cc_avatar", state.profile.avatar);
  localStorage.setItem("cc_color", state.profile.color);
}

function saveSession(roomCode, playerId) {
  state.roomCode = roomCode;
  state.playerId = playerId;
  localStorage.setItem("cc_room", roomCode);
  localStorage.setItem("cc_player", playerId);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function brand() {
  const wrapper = document.createElement("div");
  wrapper.className = "brand-mark";
  wrapper.append(speechTemplate.content.cloneNode(true));
  return wrapper.outerHTML;
}

function avatarIcon(avatar, color, small = false) {
  return `<span class="avatar-icon avatar-${escapeHtml(avatar)} ${small ? "small" : ""}" style="--avatar-color:${escapeHtml(color)}"></span>`;
}

async function api(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went sideways.");
  return data;
}

function connectEvents() {
  if (state.source) state.source.close();
  if (!state.roomCode || !state.playerId) return;
  const source = new EventSource(`/events?room=${encodeURIComponent(state.roomCode)}&player=${encodeURIComponent(state.playerId)}`);
  state.source = source;
  source.addEventListener("state", (event) => {
    state.room = JSON.parse(event.data);
    state.screen = "room";
    render();
    if (state.room.phase === "final") startConfetti();
  });
  source.onerror = () => {
    showToast("Lost connection. Refreshing the room link usually fixes it.");
  };
}

function showToast(message) {
  state.toast = message;
  render();
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    state.toast = "";
    render();
  }, 2600);
}

function isLocalOrigin() {
  return ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
}

function inviteOrigin(room) {
  if (isLocalOrigin() && room?.networkOrigins?.length) return room.networkOrigins[0];
  return location.origin;
}

function inviteUrl(room) {
  return `${inviteOrigin(room)}/?room=${room.code}`;
}

function topbar(room = null) {
  return `
    <header class="topbar">
      <div class="brand">
        ${brand()}
        <div>
          <h1>Chuckle Court</h1>
          <div class="tagline">Write nonsense. Judge nonsense. Become legally funny.</div>
        </div>
      </div>
      ${room ? `<div class="room-pill">Room <code>${escapeHtml(room.code)}</code></div>` : "<div></div>"}
      ${room ? `<button class="secondary" data-action="copy-link">Copy invite link</button>` : ""}
    </header>
  `;
}

function homeView() {
  return `
    ${topbar()}
    <section class="grid">
      <div class="panel hero-panel">
        <div>
          <h2>Party answers with courtroom-level bad judgment.</h2>
          <p class="tagline">Six main rounds, optional chaos minigames, anonymous question swaps, host moderation, and real room links for friends.</p>
        </div>
        <div class="actions">
          <button data-action="create-room">Create lobby</button>
          <button class="secondary" data-action="show-join">Join with code</button>
        </div>
      </div>
      ${profilePanel()}
    </section>
  `;
}

function profilePanel() {
  return `
    <aside class="panel tint-blue">
      <h2>Profile</h2>
      <div class="profile-grid">
        <label>
          <strong>Name</strong>
          <input data-field="name" maxlength="24" value="${escapeHtml(state.profile.name)}" placeholder="Waffle Lawyer" />
        </label>
        <div>
          <strong>Badge</strong>
          <div class="avatar-grid">
            ${avatars.map((avatar) => `
              <button class="avatar-choice ${state.profile.avatar === avatar ? "selected" : ""}" data-avatar="${avatar}" aria-label="${avatar}">
                ${avatarIcon(avatar, state.profile.color)}
              </button>
            `).join("")}
          </div>
        </div>
        <div>
          <strong>Color</strong>
          <div class="color-grid">
            ${colors.map((color) => `
              <button class="color-choice ${state.profile.color === color ? "selected" : ""}" data-color="${color}" aria-label="${color}" style="background:${color}"></button>
            `).join("")}
          </div>
        </div>
      </div>
    </aside>
  `;
}

function joinView() {
  return `
    ${topbar()}
    <section class="grid">
      <div class="panel tint-yellow">
        <h2>Join a lobby</h2>
        <div class="stack">
          <label>
            <strong>Room code</strong>
            <input data-field="roomCode" maxlength="5" value="${escapeHtml(state.roomCode)}" placeholder="ABCDE" />
          </label>
          <div class="actions">
            <button data-action="join-room">Enter court</button>
            <button class="secondary" data-action="home">Back</button>
          </div>
        </div>
      </div>
      ${profilePanel()}
    </section>
  `;
}

function roomView(room) {
  if (room.phase === "lobby") return lobbyView(room);
  if (room.phase === "final") return finalView(room);
  return gameView(room);
}

function lobbyView(room) {
  const canStart = room.players.length >= room.minPlayers;
  return `
    ${topbar(room)}
    <section class="grid">
      <div class="panel tint-yellow stack">
        <div>
          <h2>Lobby</h2>
          <p class="tagline">The host starts when at least two players are present.</p>
        </div>
        <div class="actions">
          ${room.isHost ? `<button data-action="start-game" ${canStart ? "" : "disabled"}>Start game</button>` : `<span class="status-badge blue">Waiting for host</span>`}
          <button class="secondary" data-action="copy-code">Copy code</button>
        </div>
        ${accessHelp(room)}
        ${room.isHost ? settingsPanel(room) : `<div class="panel tint-green"><strong>Minigames:</strong> ${room.settings.minigamesEnabled ? "enabled" : "disabled"}</div>`}
      </div>
      <aside class="panel tint-blue stack">
        <h2>Players</h2>
        ${playersList(room.players)}
      </aside>
    </section>
  `;
}

function accessHelp(room) {
  if (!isLocalOrigin()) {
    return `<div class="panel tint-green"><strong>Invite URL:</strong><br><span class="muted">${escapeHtml(inviteUrl(room))}</span></div>`;
  }

  const lanLinks = (room.networkOrigins || []).map((origin) => `${origin}/?room=${room.code}`);
  return `
    <div class="panel tint-green stack">
      <div>
        <strong>Important: localhost is only this laptop.</strong>
        <p class="muted">Phones on the same Wi-Fi should use the Wi-Fi link below. Friends in other houses/regions need a public deployed or tunneled URL.</p>
      </div>
      ${lanLinks.length ? lanLinks.map((link) => `
        <button class="secondary" data-action="copy-specific-link" data-link="${escapeHtml(link)}">Copy Wi-Fi link</button>
        <code class="muted">${escapeHtml(link)}</code>
      `).join("") : `<p class="muted">No Wi-Fi IP was detected. Check that your laptop is connected to the same network as the phones.</p>`}
    </div>
  `;
}

function settingsPanel(room) {
  return `
    <div class="toggle-row">
      <div>
        <strong>Minigames</strong>
        <div class="muted">After rounds 2, 4, and 6. Six formats are in the rotation.</div>
      </div>
      <label class="switch" aria-label="Toggle minigames">
        <input type="checkbox" data-action="toggle-minis" ${room.settings.minigamesEnabled ? "checked" : ""} />
        <span class="slider"></span>
      </label>
    </div>
  `;
}

function gameView(room) {
  const round = room.currentRound;
  return `
    ${topbar(room)}
    <section class="grid">
      <div class="stack">
        ${promptBoard(room, round)}
        ${stageView(room, round)}
      </div>
      <aside class="panel tint-green stack">
        <h2>Scoreboard</h2>
        ${scoreList(room.players)}
      </aside>
    </section>
  `;
}

function promptBoard(room, round) {
  const stageLabel = {
    questioning: "Write a question",
    answering: "Answer time",
    voting: "Vote",
    results: "Results"
  }[round.stage] || "Round";
  const roundLabel = round.type === "normal"
    ? `Main ${room.mainRound} of ${room.totalMainRounds}`
    : `Minigame ${room.miniCount}: ${round.title}`;

  return `
    <section class="prompt-board">
      <div class="phase-line">
        <span class="status-badge blue">${escapeHtml(roundLabel)}</span>
        <span class="status-badge ${round.stage === "results" ? "green" : ""}">${escapeHtml(stageLabel)}</span>
        ${round.anonymous ? `<span class="status-badge">Anonymous</span>` : ""}
      </div>
      ${round.blurb ? `<p class="muted">${escapeHtml(round.blurb)}</p>` : ""}
      <div class="prompt-text">${escapeHtml(round.kind === "questionAnswer" && round.stage === "answering" && round.myAssignment ? round.myAssignment.question : round.prompt)}</div>
    </section>
  `;
}

function stageView(room, round) {
  if (round.stage === "questioning") {
    return submitPanel("Write a question that will be sent to someone else.", "Make it weird, short, and dangerously answerable.", round.submitted);
  }
  if (round.stage === "answering") {
    return submitPanel("Write your answer.", round.kind === "questionAnswer" ? "Your name stays hidden in this minigame." : "After voting, the court reveals who wrote what.", round.submitted);
  }
  if (round.stage === "voting") return votingPanel(room, round);
  if (round.stage === "results") return resultsPanel(room, round);
  return "";
}

function submitPanel(title, placeholder, submitted) {
  // Use state.draft to persist in-progress text across server-driven re-renders
  return `
    <section class="panel tint-blue">
      <form class="answer-form" data-form="submit">
        <h2>${escapeHtml(title)}</h2>
        ${submitted ? `<span class="status-badge green">Submitted</span>` : ""}
        <textarea name="text" maxlength="220" placeholder="${escapeHtml(placeholder)}" ${submitted ? "disabled" : ""}>${escapeHtml(state.draft || "")}</textarea>
        <div class="actions">
          <button type="submit" ${submitted ? "disabled" : ""}>Submit</button>
          <span class="muted">Max 220 characters.</span>
        </div>
      </form>
    </section>
  `;
}

function votingPanel(room, round) {
  const options = round.options || [];
  const votable = options.some((option) => option.canVote);
  return `
    <section class="panel tint-yellow stack">
      <div>
        <h2>Pick the funniest</h2>
        <p class="tagline">${votable ? "You cannot vote for your own entry." : "No eligible entries for you this time."}</p>
      </div>
      <div class="options-list">
        ${options.map((option) => optionCard(room, round, option, true)).join("") || `<p class="muted">Waiting for answers...</p>`}
      </div>
    </section>
  `;
}

function resultsPanel(room, round) {
  return `
    <section class="panel tint-yellow stack">
      <div class="phase-line">
        <h2>Verdict</h2>
        ${room.isHost ? `<button data-action="next-round">Next</button>` : `<span class="status-badge blue">Waiting for host</span>`}
      </div>
      <div class="options-list">
        ${(round.options || []).map((option) => optionCard(room, round, option, false)).join("")}
      </div>
    </section>
  `;
}

function optionCard(room, round, option, voting) {
  const selected = round.vote === option.id;
  const disabled = !option.canVote || Boolean(round.vote) || option.flagged || option.valid === false;
  const hostTools = room.isHost && !option.flagged ? `<button class="danger" data-action="flag" data-target="${option.id}">Remove</button>` : "";
  const voteControl = voting
    ? `<button class="vote-button ${selected ? "selected" : ""}" data-action="vote" data-target="${option.id}" ${disabled ? "disabled" : ""}>${selected ? "Voted" : "Vote"}</button>`
    : `<span class="status-badge green">${option.votes} vote${option.votes === 1 ? "" : "s"}</span>`;

  if (round.kind === "questionAnswer") {
    return `
      <article class="option-card ${option.flagged ? "flagged" : ""}">
        <div class="pair">
          <div class="pair-question"><strong>Q:</strong> ${escapeHtml(option.question)}</div>
          <div class="pair-answer"><strong>A:</strong> ${escapeHtml(option.answer)}</div>
        </div>
        <div class="option-footer">
          <span class="muted">${option.isMine ? "Your fingerprints are on this one" : "Anonymous pair"}</span>
          <div class="actions">${voteControl}${hostTools}</div>
        </div>
      </article>
    `;
  }

  return `
    <article class="option-card ${option.flagged ? "flagged" : ""} ${option.valid ? "" : "invalid"}">
      <div class="option-text">${escapeHtml(option.text)}</div>
      ${option.valid ? "" : `<span class="status-badge red">${escapeHtml(option.invalidReason || "Disqualified")}</span>`}
      <div class="option-footer">
        <span class="phase-line">
          ${avatarIcon(option.authorAvatar, option.authorColor, true)}
          <strong>${escapeHtml(option.authorName)}</strong>
          ${option.isMine ? `<span class="status-badge">You</span>` : ""}
        </span>
        <div class="actions">${voteControl}${hostTools}</div>
      </div>
    </article>
  `;
}

function finalView(room) {
  const names = room.winner.map((player) => player.name).join(" + ");
  return `
    ${topbar(room)}
    <section class="grid">
      <div class="panel winner-banner">
        <div>
          <h2>${escapeHtml(names)} wins!</h2>
          <p class="tagline">The court has spoken, which is worrying but official.</p>
          ${room.isHost ? `<button data-action="restart">Back to lobby</button>` : `<span class="status-badge blue">Waiting for host</span>`}
        </div>
      </div>
      <aside class="panel tint-green stack">
        <h2>Final scores</h2>
        ${scoreList(room.players)}
      </aside>
    </section>
  `;
}

function playersList(players) {
  return `<div class="player-list">
    ${players.map((player) => `
      <div class="player-row">
        ${avatarIcon(player.avatar, player.color, true)}
        <div class="player-name">${escapeHtml(player.name)}</div>
        <div class="phase-line">
          ${player.host ? `<span class="host-badge">Host</span>` : ""}
          <span class="status-badge ${player.connected ? "green" : ""}">${player.connected ? "Online" : "Away"}</span>
        </div>
      </div>
    `).join("")}
  </div>`;
}

function scoreList(players) {
  return `<div class="score-list">
    ${players.map((player, index) => `
      <div class="score-row">
        ${avatarIcon(player.avatar, player.color, true)}
        <div class="player-name">${index + 1}. ${escapeHtml(player.name)}</div>
        <div class="score-points">${player.score}</div>
      </div>
    `).join("")}
  </div>`;
}

function toastView() {
  return state.toast ? `<div class="toast">${escapeHtml(state.toast)}</div>` : "";
}

function render() {
  // Try to preserve focus and selection for inputs/textareas inside #app so server-driven re-renders
  // don't clobber what the user is actively typing.
  const focused = document.activeElement;
  let focusInfo = null;
  if (focused && app.contains(focused) && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA')) {
    focusInfo = {
      field: focused.dataset ? focused.dataset.field : null,
      name: focused.name || null,
      start: typeof focused.selectionStart === 'number' ? focused.selectionStart : null,
      end: typeof focused.selectionEnd === 'number' ? focused.selectionEnd : null
    };
  }

  let html = "";
  if (state.screen === "join") html = joinView();
  else if (state.screen === "room" && state.room) html = roomView(state.room);
  else html = homeView();
  app.innerHTML = html + toastView();

  if (focusInfo) {
    let selector = null;
    if (focusInfo.field) selector = `[data-field="${focusInfo.field}"]`;
    else if (focusInfo.name) selector = `[name="${focusInfo.name}"]`;
    const el = selector ? app.querySelector(selector) : null;
    if (el) {
      el.focus();
      try {
        if (focusInfo.start !== null && focusInfo.end !== null) el.setSelectionRange(focusInfo.start, focusInfo.end);
      } catch (e) {
        // ignore if browser doesn't support setSelectionRange
      }
    }
  }
}

app.addEventListener("input", (event) => {
  const field = event.target.dataset.field;
  // If the input has a named data-field (profile/name/roomCode etc), handle it normally
  if (field) {
    if (field === "roomCode") {
      state.roomCode = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
      event.target.value = state.roomCode;
      return;
    }
    state.profile[field] = event.target.value;
    saveProfile();
    return;
  }

  // Persist textarea draft content so server push updates (EventSource) don't wipe it
  if (event.target.name === "text") {
    state.draft = event.target.value;
    return;
  }
});

app.addEventListener("click", async (event) => {
  const avatarButton = event.target.closest("[data-avatar]");
  if (avatarButton) {
    state.profile.avatar = avatarButton.dataset.avatar;
    saveProfile();
    render();
    return;
  }

  const colorButton = event.target.closest("[data-color]");
  if (colorButton) {
    state.profile.color = colorButton.dataset.color;
    saveProfile();
    render();
    return;
  }

  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;

  try {
    if (action === "home") {
      state.screen = "home";
      render();
    } else if (action === "show-join") {
      state.screen = "join";
      render();
    } else if (action === "create-room") {
      await createRoom();
    } else if (action === "join-room") {
      await joinRoom();
    } else if (action === "start-game") {
      await roomAction("/api/start", {});
    } else if (action === "toggle-minis") {
      await roomAction("/api/settings", { minigamesEnabled: button.checked });
    } else if (action === "copy-link") {
      await copyText(inviteUrl(state.room));
      showToast(isLocalOrigin() ? "Copied the Wi-Fi invite link." : "Invite link copied.");
    } else if (action === "copy-specific-link") {
      await copyText(button.dataset.link);
      showToast("Wi-Fi invite link copied.");
    } else if (action === "copy-code") {
      await copyText(state.room.code);
      showToast("Room code copied.");
    } else if (action === "vote") {
      await roomAction("/api/vote", { targetId: button.dataset.target });
    } else if (action === "flag") {
      await roomAction("/api/flag", { targetId: button.dataset.target });
    } else if (action === "next-round") {
      await roomAction("/api/next", {});
    } else if (action === "restart") {
      stopConfetti();
      await roomAction("/api/restart", {});
    }
  } catch (error) {
    showToast(error.message);
  }
});

app.addEventListener("submit", async (event) => {
  if (event.target.dataset.form !== "submit") return;
  event.preventDefault();
  // Prefer the draft (which persists across re-renders) but fall back to the form value
  const formText = new FormData(event.target).get("text");
  const text = (state.draft && state.draft.length) ? state.draft : formText;
  try {
    await roomAction("/api/submit", { text });
    // Clear the draft after a successful submit so the textarea resets
    state.draft = "";
    render();
  } catch (error) {
    showToast(error.message);
  }
});

async function createRoom() {
  saveProfile();
  const data = await api("/api/create", state.profile);
  saveSession(data.roomCode, data.playerId);
  state.room = data.room;
  state.screen = "room";
  history.replaceState({}, "", `/?room=${data.roomCode}`);
  connectEvents();
  render();
}

async function joinRoom() {
  saveProfile();
  const data = await api("/api/join", {
    ...state.profile,
    roomCode: state.roomCode,
    playerId: state.playerId
  });
  saveSession(data.roomCode, data.playerId);
  state.room = data.room;
  state.screen = "room";
  history.replaceState({}, "", `/?room=${data.roomCode}`);
  connectEvents();
  render();
}

async function roomAction(path, extra) {
  const data = await api(path, {
    roomCode: state.room.code,
    playerId: state.playerId,
    ...extra
  });
  if (data.room) state.room = data.room;
  render();
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  } else {
    const input = document.createElement("input");
    input.value = text;
    document.body.append(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }
}

function startConfetti() {
  if (state.confettiOn) return;
  state.confettiOn = true;
  const canvas = document.querySelector("#confetti");
  const context = canvas.getContext("2d");
  const pieces = Array.from({ length: 120 }, () => ({
    x: Math.random(),
    y: Math.random() - 1,
    size: 5 + Math.random() * 9,
    speed: 1.2 + Math.random() * 3,
    spin: Math.random() * Math.PI,
    color: colors[Math.floor(Math.random() * colors.length)]
  }));

  function resize() {
    canvas.width = innerWidth * devicePixelRatio;
    canvas.height = innerHeight * devicePixelRatio;
  }

  resize();
  addEventListener("resize", resize);

  function tick() {
    if (!state.confettiOn) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    context.clearRect(0, 0, canvas.width, canvas.height);
    for (const piece of pieces) {
      piece.y += piece.speed / innerHeight;
      piece.spin += 0.08;
      if (piece.y > 1.1) {
        piece.y = -0.1;
        piece.x = Math.random();
      }
      context.save();
      context.translate(piece.x * canvas.width, piece.y * canvas.height);
      context.rotate(piece.spin);
      context.fillStyle = piece.color;
      context.fillRect(-piece.size, -piece.size / 2, piece.size * 2, piece.size);
      context.restore();
    }
    requestAnimationFrame(tick);
  }

  tick();
}

function stopConfetti() {
  state.confettiOn = false;
}

render();
