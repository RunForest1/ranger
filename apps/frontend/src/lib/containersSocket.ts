import { io } from 'socket.io-client';

// Отдельный namespace от builds-сокета (см. containers.gateway.ts на бэкенде) —
// оба гейтвея слушают событие 'subscribe', и в общем namespace обработчики
// срабатывали бы на подписки друг друга.
export const containersSocket = io('/containers', { autoConnect: false, withCredentials: true });
