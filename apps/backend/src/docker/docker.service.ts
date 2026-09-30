import { Injectable } from '@nestjs/common';
import Docker from 'dockerode';

// Без опций dockerode сам находит сокет хоста (/var/run/docker.sock на Linux) —
// тот же способ подключения, что уже использует sandbox-executor. Единственный
// клиент на процесс, инжектируется во все модули, которым нужен Docker API
// (containers, deployments) — раздел 3 CLAUDE.md: "один способ сделать типовую
// вещь", не заводить второй клиент или сырой exec('docker ...') рядом.
@Injectable()
export class DockerService extends Docker {}
