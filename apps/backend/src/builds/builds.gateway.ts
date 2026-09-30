import { OnGatewayConnection, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { BuildStep } from './builds.types';

@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class BuildsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket) {
    client.on('disconnect', () => {});
  }

  @SubscribeMessage('subscribe')
  onSubscribe(client: Socket, buildId: string) {
    client.join(this.room(buildId));
  }

  emitLog(buildId: string, chunk: string) {
    this.server.to(this.room(buildId)).emit('log', chunk);
  }

  emitSteps(buildId: string, steps: BuildStep[]) {
    this.server.to(this.room(buildId)).emit('steps', steps);
  }

  emitStatus(buildId: string, status: string) {
    this.server.to(this.room(buildId)).emit('status', status);
  }

  private room(buildId: string) {
    return `build:${buildId}`;
  }
}
