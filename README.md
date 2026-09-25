# 🎮 Pac-Style Career Maze

A real-time multiplayer classroom maze-chase career quiz for 4–5 players.

## Features

- 4–5 real players on separate devices
- Host lobby
- QR-code join link
- Player names and unique colors
- 10 career questions
- 20-second rounds
- A/B/C answer zones
- First correct = 2 points
- Other correct answers = 1 point
- Wrong/no answer = 0 points
- iPad touch buttons
- Swipe-ready/mobile-friendly layout
- Five colorful ghost-like monsters
- Final scoreboard
- Socket.IO real-time communication

## Run locally

Install Node.js 18+.

```bash
npm install
npm start
```

Open:

```text
http://localhost:3000
```

For students on other devices, the server must be reachable from their network. For classroom use, deploy the project to Render, Railway, Fly.io, or another Node/WebSocket-compatible host.

## Render

Create a Web Service connected to this GitHub repository.

Build command:

```text
npm install
```

Start command:

```text
npm start
```

Environment:

```text
NODE_VERSION=18
```

Render provides the public HTTPS URL. Open that URL on the teacher device. The host lobby generates a QR code containing the public join URL.

## GitHub

Upload all files and folders exactly as provided.

Do not upload `node_modules`.

## Important

This project uses original CSS/JavaScript arcade-style graphics rather than copied game artwork. It is inspired by the maze-chase genre.

## Current game architecture

- `server.js` — Express + Socket.IO multiplayer server
- `public/index.html` — application shell
- `public/style.css` — responsive arcade interface
- `public/game.js` — host/player UI and gameplay
- `public/questions.js` — 10 career questions
- `package.json` — Node dependencies
