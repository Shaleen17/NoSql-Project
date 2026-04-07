# ChatFlow: Real-Time Chat Application Using MongoDB and Socket.IO

This project is a full-stack one-to-one chat app built around a database-heavy NoSQL design.

## Tech Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Real-time: Socket.IO
- Database: MongoDB + Mongoose
- Auth: JWT + bcryptjs

## Features

- User registration and login
- JWT-protected REST APIs
- User list with online/offline state
- One-to-one chat creation with duplicate-chat prevention
- Real-time send and receive messages
- Permanent message storage in MongoDB
- Message history pagination endpoint
- Last message and chat ordering
- Per-user unread counts on each chat
- Seen updates and typing indicator

## Database Collections

- `users`: account details, password hash, online status, last seen timestamps
- `chats`: participants, direct chat key, last message metadata, unread counts
- `messages`: one document per message, linked by `chatId`

## Important Indexes

- `users.email` unique index through the schema field
- `users.name` index for user search
- `chats.participants` index for fetching a user's chats
- `chats.updatedAt` index for chat list sorting
- `chats.directKey` unique sparse index through the schema field to prevent duplicate one-to-one chats
- `messages.chatId + createdAt` compound index for message pagination
- `messages.receiver + status` index for seen/unread updates

## Setup

1. Install backend dependencies.

```bash
cd backend
npm install
```

2. Create backend environment file.

```powershell
Copy-Item .env.example .env
```

3. Update `backend/.env`.

```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/realtime_chat
JWT_SECRET=replace_with_a_long_random_secret
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:5173
```

4. Install frontend dependencies.

```bash
cd ../frontend
npm install
```

5. Create frontend environment file.

```powershell
Copy-Item .env.example .env
```

6. Start both apps in separate terminals.

```bash
cd backend
npm run dev
```

```bash
cd frontend
npm run dev
```

7. Open the frontend at `http://localhost:5173`.

## Demo Flow

1. Register two users in separate browser windows.
2. Open the chat page for both users.
3. Select the other user from the user list to create a chat.
4. Send a message and watch it appear instantly in the other window.
5. Refresh the page and confirm the message history loads from MongoDB.
6. Leave one window and confirm online/offline status updates.

## API Summary

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/users/me`
- `GET /api/users`
- `POST /api/chats`
- `GET /api/chats`
- `POST /api/messages`
- `GET /api/messages/:chatId?page=1&limit=20`
- `PUT /api/messages/seen/:chatId`

## Socket.IO Events

- Client emits: `join_chat`, `leave_chat`, `send_message`, `typing`, `stop_typing`, `mark_seen`
- Server emits: `receive_message`, `chat_updated`, `messages_seen`, `typing`, `stop_typing`, `user_online`, `user_offline`
