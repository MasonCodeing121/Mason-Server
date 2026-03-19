# Socket.io Multiplayer Game Server

A generic, game-agnostic Socket.io server for multiplayer games, with a built-in HTML admin control panel.

## Stack
- **Runtime**: Node.js 20
- **Framework**: Express 5 + Socket.io 4
- **Port**: 5000

## Files
- `server.js` — Socket.io server logic
- `public/index.html` — Admin control panel (served at `/`)
- `package.json` — Dependencies and start script

## Socket.io API (game clients connect to this)

### Rooms
| Event (emit) | Payload | Description |
|---|---|---|
| `room:create` | `{ roomId?, name?, maxPlayers?, gameData? }` | Create a new room |
| `room:join` | `{ roomId, playerName?, playerData? }` | Join a room |
| `room:leave` | `{ roomId? }` | Leave a room |
| `room:list` | — | Get list of all rooms |
| `room:destroy` | `{ roomId? }` | Delete a room |

### Game
| Event (emit) | Payload | Description |
|---|---|---|
| `game:start` | `{ roomId? }` | Start the game in a room |
| `game:end` | `{ roomId? }` | End the game in a room |
| `game:update` | `{ roomId?, payload }` | Broadcast a state update to room (excludes sender) |
| `game:event` | `{ roomId?, event, payload }` | Broadcast a named event to all room members |

### Chat
| Event (emit) | Payload | Description |
|---|---|---|
| `chat:message` | `{ roomId?, message }` | Send a chat message to the room |

### Admin
| Event (emit) | Payload | Description |
|---|---|---|
| `admin:kick` | `{ targetId, roomId? }` | Kick a player by socket ID |
| `admin:broadcast` | `{ message }` | Broadcast a message to all connected sockets |

### Incoming events (listen for these)
- `server:stats` — Full server stats with room list
- `room:created`, `room:joined`, `room:player_joined`, `room:player_left`, `room:destroyed`
- `game:started`, `game:ended`, `game:update`, `game:event`
- `chat:message`, `admin:broadcast`, `admin:kicked`
- `error` — `{ message }`

## Running
```
npm start
```
