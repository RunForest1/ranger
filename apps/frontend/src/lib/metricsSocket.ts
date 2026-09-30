import { io } from 'socket.io-client';

// Отдельный namespace от builds/containers-сокетов (см. metrics.gateway.ts на
// бэкенде) — здесь клиенту нечего подписывать, метрики транслируются широковещательно.
export const metricsSocket = io('/metrics', { autoConnect: false, withCredentials: true });
