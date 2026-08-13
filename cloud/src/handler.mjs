/**
 * Lambda hinter einer API-Gateway-WebSocket-Schnittstelle.
 *
 * Das Gegenstück zum lokalen Programm in `server/` – gleiches Protokoll,
 * gleiche Regeln, nur eben in der Cloud. Es wird nur gebraucht, wenn die
 * Bediengeräte über das Internet angebunden werden sollen; am See ist das
 * lokale Programm der verlässlichere Weg.
 *
 * Zustand liegt in einer DynamoDB-Tabelle:
 *
 *   pk = "room#<raum>"     sk = "conn#<connectionId>"   → offene Verbindung
 *   pk = "room#<raum>"     sk = "state"                 → letzter Gesamtzustand
 *
 * Die Einträge tragen eine TTL, damit nach einer Veranstaltung nichts liegen
 * bleibt und die Tabelle im kostenlosen Kontingent bleibt.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'
import {
  ApiGatewayManagementApiClient,
  DeleteConnectionCommand,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi'
import { parseHead, route } from './relay.mjs'

const TABLE = process.env.TABLE_NAME
const HOST_KEY = process.env.HOST_KEY ?? ''
/** Verbindungseinträge verfallen nach diesem Zeitraum von selbst. */
const TTL_SECONDS = 12 * 60 * 60

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}))

const roomKey = (room) => `room#${room}`
const connKey = (connectionId) => `conn#${connectionId}`
const ttl = () => Math.floor(Date.now() / 1000) + TTL_SECONDS

function managementClient(event) {
  const { domainName, stage } = event.requestContext
  return new ApiGatewayManagementApiClient({ endpoint: `https://${domainName}/${stage}` })
}

async function connections(room) {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
      ExpressionAttributeValues: { ':pk': roomKey(room), ':prefix': 'conn#' },
    }),
  )
  return result.Items ?? []
}

/** Sendet an eine Verbindung; abgelaufene Einträge werden dabei aufgeräumt. */
async function post(api, room, item, payload) {
  try {
    await api.send(
      new PostToConnectionCommand({ ConnectionId: item.connectionId, Data: payload }),
    )
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 410) {
      await ddb.send(
        new DeleteCommand({
          TableName: TABLE,
          Key: { pk: roomKey(room), sk: connKey(item.connectionId) },
        }),
      )
      return
    }
    throw err
  }
}

async function handleConnect(event) {
  const query = event.queryStringParameters ?? {}
  const room = query.room || 'default'
  const deviceId = query.device
  if (!deviceId) return { statusCode: 400, body: 'device fehlt' }

  const wantsHost = query.role === 'host'
  if (wantsHost && query.key !== HOST_KEY) {
    return { statusCode: 403, body: 'falscher Host-Schlüssel' }
  }

  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        pk: roomKey(room),
        sk: connKey(event.requestContext.connectionId),
        connectionId: event.requestContext.connectionId,
        room,
        deviceId,
        isHost: wantsHost,
        // Ein Gerät startet ohne Rechte; erst das „welcome“ des Hosts schaltet es frei.
        approved: wantsHost,
        expiresAt: ttl(),
      },
    }),
  )

  return { statusCode: 200, body: 'verbunden' }
}

async function handleDisconnect(event) {
  const { connectionId } = event.requestContext
  // Der Raum steht nicht im $disconnect-Ereignis – deshalb ist er Teil des
  // Sortierschlüssels und wird hier über einen gezielten Lesevorgang geholt.
  const room = await roomOfConnection(connectionId)
  if (room) {
    await ddb.send(
      new DeleteCommand({ TableName: TABLE, Key: { pk: roomKey(room), sk: connKey(connectionId) } }),
    )
  }
  return { statusCode: 200, body: 'getrennt' }
}

/**
 * Findet den Raum einer Verbindung über den globalen Sekundärindex – so bleibt
 * das Trennen ein einzelner Lesevorgang.
 */
async function roomOfConnection(connectionId) {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: 'byConnection',
      KeyConditionExpression: 'connectionId = :c',
      ExpressionAttributeValues: { ':c': connectionId },
      Limit: 1,
    }),
  )
  return result.Items?.[0]?.room ?? null
}

async function rememberState(room, payload) {
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: { pk: roomKey(room), sk: 'state', payload, expiresAt: ttl() },
    }),
  )
}

async function lastState(room) {
  const result = await ddb.send(
    new GetCommand({ TableName: TABLE, Key: { pk: roomKey(room), sk: 'state' } }),
  )
  return result.Item?.payload ?? null
}

async function setApproved(room, deviceId, approved) {
  const items = (await connections(room)).filter((c) => c.deviceId === deviceId)
  await Promise.all(
    items.map((item) =>
      ddb.send(
        new UpdateCommand({
          TableName: TABLE,
          Key: { pk: roomKey(room), sk: connKey(item.connectionId) },
          UpdateExpression: 'SET approved = :a',
          ExpressionAttributeValues: { ':a': approved },
        }),
      ),
    ),
  )
  return items
}

async function handleMessage(event) {
  const { connectionId } = event.requestContext
  const room = await roomOfConnection(connectionId)
  if (!room) return { statusCode: 200, body: 'unbekannte Verbindung' }

  const all = await connections(room)
  const sender = all.find((c) => c.connectionId === connectionId)
  if (!sender) return { statusCode: 200, body: 'unbekannter Absender' }

  const head = parseHead(event.body ?? '')
  if (!head) return { statusCode: 200, body: 'unlesbar' }

  const decision = route(head, { isHost: !!sender.isHost, approved: !!sender.approved })
  if (decision.target === 'drop') return { statusCode: 200, body: 'verworfen' }

  const api = managementClient(event)
  const payload = event.body

  if (decision.remember) await rememberState(room, payload)

  switch (decision.target) {
    case 'toHost': {
      const host = all.find((c) => c.isHost)
      if (host) await post(api, room, host, payload)
      break
    }

    case 'toDevice': {
      let targets
      if (decision.approve) targets = await setApproved(room, decision.deviceId, true)
      else if (decision.revoke) targets = await setApproved(room, decision.deviceId, false)
      else targets = all.filter((c) => c.deviceId === decision.deviceId)

      await Promise.all(targets.map((item) => post(api, room, item, payload)))

      // Frisch freigegebene Geräte bekommen sofort den letzten Zustand.
      if (decision.approve) {
        const cached = await lastState(room)
        if (cached) await Promise.all(targets.map((item) => post(api, room, item, cached)))
      }
      break
    }

    case 'broadcast': {
      const targets = all.filter((c) => c.approved && !c.isHost)
      await Promise.all(targets.map((item) => post(api, room, item, payload)))
      break
    }
  }

  return { statusCode: 200, body: 'ok' }
}

export async function handler(event) {
  const routeKey = event.requestContext?.routeKey
  try {
    switch (routeKey) {
      case '$connect':
        return await handleConnect(event)
      case '$disconnect':
        return await handleDisconnect(event)
      default:
        return await handleMessage(event)
    }
  } catch (err) {
    console.error('Fehler bei', routeKey, err)
    // Ein Fehler darf die Verbindung nicht abreißen lassen – am Steg wäre das
    // schlimmer als eine verlorene Nachricht.
    if (routeKey === '$connect') return { statusCode: 500, body: 'Fehler' }
    return { statusCode: 200, body: 'Fehler' }
  }
}

/** Nur für Notfälle: eine hängende Verbindung von außen schließen. */
export async function closeConnection(event, connectionId) {
  const api = managementClient(event)
  await api.send(new DeleteConnectionCommand({ ConnectionId: connectionId }))
}
