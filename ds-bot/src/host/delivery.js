// Delivery: how one Bot, the user, or DS Bot itself puts a message into a Bot Session.
import { randomUUID } from 'node:crypto'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { LOG_WRITE_FAILURES_MAX, LOG_WRITE_FAILURE_MARK, SOURCE_KIND } from './constants.js'

export function install(rt) {
  const { ctx, state } = rt

  // Sessions whose log the codec refuses to append to. A rejected event rolls the append
  // cursor back, so every later delivery fails the same way; the count bounds how often
  // that is reported and stops the retries once the log is clearly unrepairable here.
  const logWriteFailures = new Map()

  const resolveAgent = async (sessionId) => {
    const resolved = await ctx.sessionController.resolveAgent(sessionId)
    if ('error' in resolved) throw new Error(resolved.error?.message ?? 'Session unavailable')
    rt.hideBotUnusedTools(resolved.agent)
    return resolved.agent
  }

  const headerFor = (role, fromName, roomName, audience, note = 'new message', deferred = false, { resumed = false, retried = false } = {}) => {
    if (deferred) return `[Message from ${fromName} · you read it during your last task; answer it now]`
    if (retried && role !== 'room') return '[Your last reply wrote a tool call as text, so nothing ran]'
    if (resumed && role === 'resume') return '[DeepSeek Harness restarted while you were working]'
    if (resumed && role !== 'room') return `[Message from ${fromName} · DeepSeek Harness restarted while you were working on it]`
    if (role === 'reply') return `[Reply from ${fromName}]`
    if (role === 'stopped') return `[Stopped by ${fromName}]`
    if (role === 'room') return `[Group chat "${roomName}" · ${note}]`
    if (role === 'report') return `[Group chat "${roomName}" · replies to your post]`
    if (role === 'kickoff') return '[Bot team setup]'
    if (role === 'secret') return '[Secret card]'
    if (audience === 'user') return `[Message from ${fromName} · the user sees your reply here]`
    return `[Message from ${fromName}]`
  }

  // Roles recorded as team exchanges.
  const EXCHANGE_ROLES = new Set(['request', 'reply', 'stopped'])

  // `sessionId` defaults to the recipient's own chat; group turns name its group Session.
  // `deferred`: a request the Bot already read mid-turn, handed back to answer in a
  // turn of its own; its exchange was recorded when it first arrived. `resumed` and
  // `retried` carry on a turn that a restart cut off or that wrote its tool call as
  // text (resume.js, turns.js), and `resent` is a message a shutdown cancelled; their
  // exchange is recorded already too. `askedBy` is the member whose @mention called a
  // group turn (groups.js). `fromRoomId`: the group whose Session the sender wrote
  // from; the reply goes back to that Session (turns.js).
  async function deliver({ fromId, toId, sessionId, text, role, hop = 0, replyTo, roomId, audience, note, exchangeId = randomUUID(), steer = false, deferred = false, resumed = false, retried = false, resent = false, askedBy, fromRoomId }) {
    const from = rt.botOf(fromId)
    const to = rt.botOf(toId)
    if (to === undefined) throw new Error(`Unknown Bot ${toId}`)
    const fromName = from?.name ?? 'You'
    const room = rt.roomOf(roomId)
    // Session events reject `undefined` members, so optional fields are omitted instead.
    const source = {
      kind: SOURCE_KIND,
      form: 'relay',
      role,
      exchangeId,
      senderName: fromName,
      hop,
      ...(fromId ? { senderSessionId: fromId } : {}),
      ...(replyTo ? { replyTo } : {}),
      ...(roomId ? { roomId } : {}),
      ...(audience === 'user' ? { audience } : {}),
      ...(deferred ? { deferred: true } : {}),
      ...(resumed ? { resumed: true } : {}),
      ...(retried ? { retried: true } : {}),
      ...(askedBy ? { askedBy } : {}),
      ...(fromRoomId ? { senderRoomId: fromRoomId } : {}),
    }
    if (EXCHANGE_ROLES.has(role) && !deferred && !resumed && !retried && !resent) {
      state.exchanges.push({ id: exchangeId, from: fromId, to: toId, text, role, time: Date.now(), ...(replyTo ? { replyTo } : {}), ...(audience === 'user' ? { audience } : {}) })
      void rt.save().catch(() => {})
    }
    const targetSessionId = sessionId ?? rt.chatOf(toId)
    await rt.ensureCapabilities(targetSessionId)
    const agent = await resolveAgent(targetSessionId)
    // A steered message cuts into a running turn at its next step; a follow-up
    // queues for the next turn (see turns.js for how each is routed).
    const message = createUserMessage({
      content: [{ type: 'text', text: `${headerFor(role, fromName, room?.name, audience, note, deferred, { resumed, retried })}\n${text}` }],
      source,
    })
    if (steer) agent.steer(message)
    else agent.followup(message)
    try {
      await ctx.sessions.flush(agent.session)
      logWriteFailures.delete(targetSessionId)
    } catch (error) {
      // A Session-format rejection is not transient: the append cursor stays where it
      // was, so the next delivery fails identically. Report it at most a few times and
      // then leave the Session alone instead of retrying it forever.
      if (!isLogWriteFailure(error)) throw error
      const failures = (logWriteFailures.get(targetSessionId) ?? 0) + 1
      logWriteFailures.set(targetSessionId, failures)
      if (failures <= LOG_WRITE_FAILURES_MAX) {
        rt.warn('ds-bot: Session %s cannot be written to any more (%s); later messages to it are dropped until its log is repaired', targetSessionId, error.message)
      }
      throw error
    }
    return exchangeId
  }

  // The codec rejects an event and rolls back, which is what makes the failure permanent.
  // A transient I/O error carries a different name and must still propagate untouched.
  const isLogWriteFailure = (error) => {
    if (error?.name !== LOG_WRITE_FAILURE_MARK && !String(error?.message ?? '').includes(LOG_WRITE_FAILURE_MARK)) return false
    return /tool\/result|toolCallId|format v\d/.test(String(error?.message ?? ''))
  }

  Object.assign(rt, { resolveAgent, deliver })
}
