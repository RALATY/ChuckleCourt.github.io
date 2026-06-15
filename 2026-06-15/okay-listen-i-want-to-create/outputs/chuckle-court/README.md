# Chuckle Court

Chuckle Court is a tiny real-time party game inspired by lobby-and-round party games: players join with a room code, answer funny prompts, vote for the funniest responses, and earn points.

## Run

```bash
npm start
```

Then open:

```text
http://localhost:3000
```

## Let Other People Join

`localhost` only works on the device running the server. If you send a friend `http://localhost:3000`, their phone tries to connect to their own phone, not your laptop.

For people on the same Wi-Fi:

1. Start the server on your laptop.
2. Open `http://localhost:3000` on your laptop.
3. Create a lobby.
4. Use the Wi-Fi invite link shown in the lobby, such as `http://192.168.1.25:3000/?room=ABCDE`.
5. If it still fails, allow Node.js through Windows Firewall for private networks.

For people in other houses, cities, or regions:

- Deploy this folder to a public Node host, or
- Use a tunnel such as Cloudflare Tunnel/ngrok and send the public HTTPS URL.

Once the app is on a public URL, normal invite links work from anywhere.

## What is included

- Real multiplayer lobbies with room codes and invite links
- Host-only start controls and minigame toggle
- Minimum 2 players to start
- Six main prompt rounds
- Optional minigames after main rounds 2, 4, and 6
- Six functional minigame formats in the rotation
- Anonymous question-and-answer minigame where both writers split vote points
- Voting, automatic scoring, scoreboard, and final winner screen
- Host moderation to remove answers or anonymous pairs from voting/results

Rooms are stored in memory, so restarting the server clears active games. For public play, deploy this folder to any Node host that supports long-lived HTTP connections.
