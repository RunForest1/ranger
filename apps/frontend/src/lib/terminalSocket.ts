import { io } from 'socket.io-client';

// Отдельный namespace — см. terminal.gateway.ts на бэкенде.
export const terminalSocket = io('/terminal', { autoConnect: false, withCredentials: true });
