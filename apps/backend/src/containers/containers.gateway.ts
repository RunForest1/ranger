import { OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { PassThrough } from 'stream';
import { DockerService } from '../docker/docker.service';

// Отдельный namespace от BuildsGateway: оба гейтвея слушают событие 'subscribe',
// и в общем namespace обработчики срабатывали бы на подписки друг друга.
//
// Один активный docker-логовый стрим на сокет-соединение — в отличие от сборок
// (см. builds.gateway.ts), тут стрим открывается по требованию конкретного клиента
// и должен закрываться вместе с ним, иначе `docker logs --follow` продолжит
// работать в фоне после того, как никто уже не слушает.
@WebSocketGateway({ namespace: 'containers', cors: { origin: true, credentials: true } })
export class ContainersGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly activeStreams = new Map<string, NodeJS.ReadableStream>();

  constructor(private readonly docker: DockerService) {}

  handleConnection() {}

  handleDisconnect(client: Socket) {
    this.stopStream(client.id);
  }

  @SubscribeMessage('subscribe')
  async onSubscribe(client: Socket, containerId: string) {
    this.stopStream(client.id);

    const container = this.docker.getContainer(containerId);
    const logStream = (await container.logs({
      follow: true,
      stdout: true,
      stderr: true,
      tail: 200,
    })) as unknown as NodeJS.ReadableStream;
    this.activeStreams.set(client.id, logStream);

    const stdout = new PassThrough();
    const stderr = new PassThrough();
    this.docker.modem.demuxStream(logStream, stdout, stderr);

    let buffer = '';
    const emitChunk = (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        client.emit('log', line);
      }
    };
    stdout.on('data', emitChunk);
    stderr.on('data', emitChunk);
  }

  @SubscribeMessage('unsubscribe')
  onUnsubscribe(client: Socket) {
    this.stopStream(client.id);
  }

  private stopStream(clientId: string) {
    const stream = this.activeStreams.get(clientId);
    if (stream && 'destroy' in stream && typeof stream.destroy === 'function') {
      stream.destroy();
    }
    this.activeStreams.delete(clientId);
  }
}
