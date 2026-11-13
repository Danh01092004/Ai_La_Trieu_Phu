import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import {
  io,
  type ManagerOptions,
  type Socket,
  type SocketOptions,
} from 'socket.io-client'
import httpServer from '../../api/socket-io/[...path]'
import type { RoomCreateAck, RoomJoinAck } from '../../src/types/multiplayer'

const SOCKET_PATH = '/api/socket-io/socket.io'

function waitForConnect(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('socket connect timed out')),
      5_000,
    )
    socket.once('connect', () => {
      clearTimeout(timer)
      resolve()
    })
    socket.once('connect_error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

function createRoom(socket: Socket, name: string): Promise<RoomCreateAck> {
  return new Promise((resolve) => {
    socket.emit('room:create', { name }, resolve)
  })
}

function joinRoom(
  socket: Socket,
  code: string,
  name: string,
): Promise<RoomJoinAck> {
  return new Promise((resolve) => {
    socket.emit('room:join', { code, name }, resolve)
  })
}

async function main(): Promise<void> {
  await new Promise<void>((resolve) => {
    httpServer.listen(0, '127.0.0.1', resolve)
  })
  const address = httpServer.address() as AddressInfo
  const url = `http://127.0.0.1:${address.port}`
  const options: Partial<ManagerOptions & SocketOptions> = {
    path: SOCKET_PATH,
    addTrailingSlash: false,
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  }

  const admin = io(url, options)
  const player = io(url, options)

  try {
    await Promise.all([waitForConnect(admin), waitForConnect(player)])

    const created = await createRoom(admin, 'Vercel Admin')
    assert.equal(created.ok, true)

    const joined = await joinRoom(player, created.code, 'Vercel Player')
    assert.equal(joined.ok, true)
    assert.equal(joined.room.players.length, 1)
    assert.equal(joined.room.code, created.code)

    console.info(
      '[vercel-adapter] websocket handshake, room create/join and shared state passed',
    )
  } finally {
    admin.close()
    player.close()
    await new Promise<void>((resolve, reject) => {
      httpServer.close((error) => (error ? reject(error) : resolve()))
    })
  }
}

void main().catch((error: unknown) => {
  console.error('[vercel-adapter] failed:', error)
  process.exitCode = 1
})
